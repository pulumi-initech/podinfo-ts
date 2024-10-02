import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface Metadata {
    name: string;
}
interface ClusterSecretStore {
    kind: string;
    metadata: Metadata;
}

const config = new pulumi.Config();

const provider = new k8s.Provider("k8s", {
    kubeconfig: config.get("kubeConfig")
})

const clusterSecretStore = config.getObject<ClusterSecretStore>("clusterSecretStoreRef")!;

// cut for brevity
const podInfo = new k8s.helm.v3.Release("podinfo", {
    chart: "podinfo",
    version: "6.7.0",
    namespace: "podinfo",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://stefanprodan.github.io/podinfo",
    },
    values: {
        extraEnvs: [
            {
                name: "FROM_ESC_VIA_ESO",
                valueFrom: {
                    secretKeyRef: {
                        name: "esc-secret-store",
                        key: "secret-1",
                    }
                }
            },
            {
                name: "FROM_ESC_VIA_ESO_2",
                valueFrom: {
                    secretKeyRef: {
                        name: "esc-secret-store",
                        key: "secret-2",
                    }
                }
            }
        ]
    },
}, { provider });

const externalSecretPodInfo = new k8s.apiextensions.CustomResource("external-secret-podinfo", {
    apiVersion: "external-secrets.io/v1beta1",
    kind: "ExternalSecret",
    metadata: {
        name: "esc-secret-store",
        namespace: podInfo.namespace,
    },
    spec: {
        dataFrom: [
            {
                extract: {
                    conversionStrategy: "Default",
                    key: "secrets",
                }
            }
        ],
        refreshInterval: "10s",
        secretStoreRef: {
            kind: clusterSecretStore.kind,
            name: clusterSecretStore.metadata.name,
        }
    },
}, { provider });

const appLabels = { app: "nginx" };

const deployment = new k8s.apps.v1.Deployment("nginx", {
    spec: {
        selector: { matchLabels: appLabels },
        replicas: 1,
        template: {
            metadata: { labels: appLabels },
            spec: { containers: [{ name: "nginx", image: "nginx" }] }
        }
    }
});

export const name = deployment.metadata.name;
