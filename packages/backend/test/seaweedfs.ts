// SeaweedFS, the local S3-compatible store (architecture §3.6), pinned by digest like every image
// (D15). Keep in step with docker/compose.yaml.
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export const SEAWEEDFS_IMAGE =
	'chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8';

export const TEST_BUCKET = 'toe-beans-test';
export const TEST_CREDENTIALS = { accessKeyId: 'test-key', secretAccessKey: 'test-secret' };

/** `weed mini`: every SeaweedFS part in one process, with the bucket made at start. */
export async function startSeaweedFs(): Promise<{
	endpoint: string;
	container: StartedTestContainer;
}> {
	const container = await new GenericContainer(SEAWEEDFS_IMAGE)
		.withCommand([
			'mini',
			'-dir=/data',
			`-bucket=${TEST_BUCKET}`,
			'-webdav=false',
			'-admin.ui=false'
		])
		.withEnvironment({
			AWS_ACCESS_KEY_ID: TEST_CREDENTIALS.accessKeyId,
			AWS_SECRET_ACCESS_KEY: TEST_CREDENTIALS.secretAccessKey
		})
		.withExposedPorts(8333)
		.withWaitStrategy(Wait.forHttp('/healthz', 8333).forStatusCode(200))
		.start();
	return {
		endpoint: `http://${container.getHost()}:${container.getMappedPort(8333)}`,
		container
	};
}
