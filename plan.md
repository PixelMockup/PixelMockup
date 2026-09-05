# Mockup Studio (PixelMockup) — DevOps Automation Plan

**Goal**: Turn the PixelMockup app into a fully automated DevOps pipeline:

1. Containerize the application (Dockerfile → build image)
2. Push the image to a container registry (Docker Hub)
3. CI pipeline (GitHub Actions) — build + test on every code change
4. Security layer (Trivy) — catch vulnerabilities before production
5. Deploy to Kubernetes (YAML manifests: Deployment + Service)
6. GitOps with ArgoCD — cluster auto-syncs changes from git
7. Monitoring — Prometheus + Grafana (app + cluster health)

**Decisions (confirmed):**

| Topic | Choice |
| --- | --- |
| CI tool | GitHub Actions (already in use) |
| Registry | Docker Hub — namespace placeholder: `YOUR_DOCKERHUB_USER` |
| Security | Trivy (container image + filesystem scans in CI) |
| Kubernetes | Local kind/minikube (EKS is a later swap with same manifests) |

---

## Current state (baseline)

- **App**: React 19 + Vite + TypeScript, served by `vite preview` on port `4173`
- **Dockerfile exists** — Node 22 + system Chromium, single-stage, no HEALTHCHECK, no non-root user
- **CI exists but is test-only**: `.github/workflows/test.yml` runs Vitest (unit/component/a11y) + Playwright e2e — no build, push, or security scanning
- **Git repo**: `PixelMockup/PixelMockup` — branches `stable` (prod) / `dev` (preview)
- **No K8s / Helm / ArgoCD artifacts yet**

---

## Phase 0 — Local verification (baseline)

Confirm the current Docker image actually works before automating anything.

```bash
cd mockup_studio
docker build -t pixel-mockup .
docker run --rm -p 4173:4173 \
  -e HOST=0.0.0.0 -e PORT=4173 \
  -e PIXEL_MOCKUP_DISABLE_SANDBOX=1 \
  -e PIXEL_MOCKUP_CHROME=/usr/bin/chromium \
  pixel-mockup
```

**Verify**: app serves at `http://localhost:4173`; website capture works (drop `https://example.com` on a device — needs Chromium + sandbox disabled).

---

## Phase 1 — Containerize (refine Dockerfile)

**Edit `Dockerfile`:**
- Add **HEALTHCHECK** (probe `:4173` with node's fetch — `curl` is not installed; install `curl` or use `node -e`)
- Run as **non-root** user (`node` user, chown `/app`)
- Keep single-stage: the runtime genuinely needs Vite (dev dependency) + the capture middleware plugins, so `--omit=dev` is not viable
- Keep `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (system Chromium, not Playwright's bundle)

**Optional follow-up (not blocking):** multi-stage build to shrink image — runtime stage only needs `dist/` + `vite` + capture plugins.

```bash
docker build -t pixel-mockup .
docker run --rm -p 4173:4173 pixel-mockup   # plus capture env vars from Phase 0
docker inspect --format='{{json .Config.Healthcheck}}' pixel-mockup
```

**Done when**: image builds, container is healthy (`docker ps` shows healthy), app + capture work.

---

## Phase 2 — Push to Docker Hub

Create a public repo `pixel-mockup` on Docker Hub, then tag/push:

```bash
docker login
docker tag pixel-mockup YOUR_DOCKERHUB_USER/pixel-mockup:latest
docker tag pixel-mockup YOUR_DOCKERHUB_USER/pixel-mockup:$(git rev-parse --short HEAD)
docker push YOUR_DOCKERHUB_USER/pixel-mockup:latest
docker push YOUR_DOCKERHUB_USER/pixel-mockup:<sha>
```

**Tag strategy** (used by CI in Phase 3):
- `latest` → built from `stable` branch
- `<commit-sha>` → every pushed build (traceability)
- `dev` → built from `dev` branch (preview)
- semver tags optional later (e.g. `v1.2.3` on release)

**Done when**: `docker pull YOUR_DOCKERHUB_USER/pixel-mockup:latest` works on any machine.

---

## Phase 3 — CI pipeline (GitHub Actions)

**Create `.github/workflows/ci.yml`** (replace/extend `test.yml`) with jobs:

| Job | What it does |
| --- | --- |
| `lint` | `npm run lint` (oxlint) |
| `unit` | `npm run test:coverage` (Vitest) + `npm run audit:prod` |
| `e2e` | `npx playwright install --with-deps chromium` + `npm run test:e2e` (existing) |
| `build-push` | Docker build via `docker/build-push-action`; Trivy scan (Phase 4) in between; push **only on `stable`** (`latest`) and `dev` (`dev` tag); always tag with commit SHA |

**GitHub secrets to add** (repo → Settings → Secrets and variables):
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN` (fine-grained token with Read/Write on the `pixel-mockup` repo)

**Done when**: pushing to a feature branch runs all checks; merging to `stable` publishes a new `latest` image to Docker Hub automatically.

---

## Phase 4 — Security layer (Trivy)

Add to the CI `build-push` job (before pushing):

1. **FS scan** — `aquasecurity/trivy-action` with `scan-type: fs` on the repo (source + lockfile vulns)
2. **Image scan** — `scan-type: image`, `image-ref: <built image>` — **fail on HIGH/CRITICAL**
3. **Misconfig scan** — `scan-type: config` on `Dockerfile` + `k8s/` manifests
4. Upload SARIF report to the GitHub Security tab (`github/codeql-action/upload-sarif`)

**Done when**: a deliberately vulnerable dependency (or a real finding) fails the build; SARIF findings appear under GitHub → Security → Code scanning.

---

## Phase 5 — Deploy to Kubernetes

### 5a. Local cluster (kind or minikube)

```bash
# kind + ingress-nginx
kind create cluster --name pixelmockup
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
# or minikube
minikube start
minikube addons enable ingress
```

### 5b. Manifests — create `k8s/` directory

| File | Contents |
| --- | --- |
| `k8s/namespace.yaml` | namespace `pixel-mockup` |
| `k8s/configmap.yaml` | `HOST=0.0.0.0`, `PORT=4173`, `PIXEL_MOCKUP_DISABLE_SANDBOX=1`, `PIXEL_MOCKUP_CHROME=/usr/bin/chromium` (Chromium is a hard requirement for capture) |
| `k8s/deployment.yaml` | 2 replicas, image `YOUR_DOCKERHUB_USER/pixel-mockup:latest`, `pullPolicy: Always`, resource requests/limits, **liveness + readiness probes** on `:4173` (match the Docker HEALTHCHECK) |
| `k8s/service.yaml` | ClusterIP service, port 4173 |
| `k8s/ingress.yaml` | ingress-nginx route (e.g. `pixelmockup.local`) or use `kubectl port-forward` for local testing |

```bash
kubectl apply -f k8s/
kubectl get pods,svc,ingress -n pixel-mockup
kubectl port-forward -n pixel-mockup svc/pixel-mockup 4173:4173
```

**Done when**: the app is reachable via the Service (and Ingress), pods are Ready, and capture works in-cluster (Chromium env vars present).

---

## Phase 6 — GitOps with ArgoCD

### 6a. Install ArgoCD into the cluster

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd get pods -w
kubectl -n argocd port-forward svc/argocd-server 8080:443
argocd admin initial-password
argocd login localhost:8080
```

### 6b. Connect the git repo + create the Application

- Add the GitHub repo to ArgoCD (`argocd repo add` — HTTPS token or SSH deploy key; private repos need credentials)
- Create **`argocd/application.yaml`** in the repo:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: pixel-mockup
  namespace: argocd
spec:
  destination:
    namespace: pixel-mockup
    server: https://kubernetes.default.svc
  project: default
  source:
    repoURL: git@github.com:PixelMockup/PixelMockup.git   # or HTTPS URL
    path: k8s
    targetRevision: stable
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

```bash
kubectl apply -f argocd/application.yaml
argocd app get pixel-mockup
```

**Done when**: editing `k8s/deployment.yaml` in git and pushing to `stable` auto-applies to the cluster within ~3 min (check `argocd app get pixel-mockup` → synced; `kubectl rollout status` shows new pods). Delete a pod — it self-heals.

---

## Phase 7 — Monitoring (Prometheus + Grafana)

### 7a. Install kube-prometheus-stack (Prometheus + Grafana + node-exporter + kube-state-metrics)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
kubectl -n monitoring get pods
```

### 7b. Access Grafana

```bash
kubectl -n monitoring get secret kube-prometheus-grafana -o jsonpath='{.data.admin-password}' | base64 -d
kubectl -n monitoring port-forward svc/kube-prometheus-grafana 3000:80
# user: admin
```

### 7c. What to observe

- **Cluster health**: kube-state-metrics + node-exporter dashboards (CPU, memory, pods, nodes) — included by default
- **App health**: `kube-prometheus-grafana` Kubernetes dashboards show deployment status; container restarts/alerts appear via kube-prometheus-stack's default alerts

**Optional follow-up (not blocking):** expose a `/metrics` endpoint from the app (prom-client or a simple counter) + add a `ServiceMonitor` in `k8s/` so ArgoCD manages it too.

**Done when**: Grafana shows live cluster metrics, alerts fire on pod down/restarts, and the whole stack survives a cluster restart.

---

## Verification checklist (end-to-end)

| # | Test | Expected |
| --- | --- | --- |
| 1 | `docker build .` | image builds |
| 2 | push to `stable` | CI runs lint/unit/e2e/Trivy → image pushed to Docker Hub |
| 3 | inject HIGH vuln / fail a test | CI fails; no push |
| 4 | push `k8s/deployment.yaml` change to `stable` | ArgoCD auto-syncs; rollout happens automatically |
| 5 | `kubectl delete pod` | pod recreated (deployment) + ArgoCD selfHeal |
| 6 | Grafana dashboards | live cluster + app metrics; alert rules active |

## Risks / notes

- **Capture features** require Chromium + `PIXEL_MOCKUP_DISABLE_SANDBOX=1` — the ConfigMap must keep these, or capture breaks in-cluster
- **App is stateless** (artboard state is client-side) → scales to N replicas freely
- **Image push needs Docker Hub secrets** in GitHub; ArgoCD needs repo credentials for private repos
- **kind/minikube → EKS later**: manifests are portable; swap ingress class and storage class only
- Keep `plan.md` and all pipeline files in git so ArgoCD sees every config change (config-as-code end to end)
