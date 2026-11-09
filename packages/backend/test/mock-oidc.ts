// The mock OIDC provider (architecture §3.4), pinned by digest like every image (D15). Keep in step
// with docker/compose.yaml and the e2e job in .github/workflows/ci.yml.
export const MOCK_OIDC_IMAGE =
	'ghcr.io/navikt/mock-oauth2-server:6.1.3@sha256:2a813381bf282da46ff36ff386059e7903e25865056af8149f4fb3f1441916b8';
