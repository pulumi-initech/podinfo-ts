import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { getResource } from "./helpers";

interface Metadata {
  name: string;
}
interface ClusterSecretStore {
  kind: string;
  metadata: Metadata;
}

const config = new pulumi.Config();

const provider = new k8s.Provider("k8s", {
  kubeconfig: config.get("kubeconfig"),
});

const clusterSecretStore = config.getObject<ClusterSecretStore>(
  "clusterSecretStoreRef"
)!;

const ns = new k8s.core.v1.Namespace("podinfo-ns", {
  metadata: {
    name: "podinfo",
  },
}, { provider });

const externalSecret = new k8s.apiextensions.CustomResource(
  "external-secret-podinfo",
  {
    apiVersion: "external-secrets.io/v1beta1",
    kind: "ExternalSecret",
    metadata: {
      name: "esc-secret-store",
      namespace: ns.metadata.name,
    },
    spec: {
      dataFrom: [
        {
          extract: {
            conversionStrategy: "Default",
            key: "secrets",
          },
        },
      ],
      refreshInterval: "10s",
      secretStoreRef: {
        kind: clusterSecretStore.kind,
        name: clusterSecretStore.metadata.name,
      },
    },
  },
  { provider }
);

const podInfo = new k8s.helm.v4.Chart(
  "podinfo",
  {
    chart: "podinfo",
    version: "6.7.0",
    namespace: ns.metadata.name,
    repositoryOpts: {
      repo: "https://stefanprodan.github.io/podinfo",
    },
    values: {
      service: {
        type: "LoadBalancer"
      },
      extraEnvs: [
        {
          name: "FROM_ESC_VIA_ESO",
          valueFrom: {
            secretKeyRef: {
              name: "esc-secret-store",
              key: "secret-1",
            },
          },
        },
        {
          name: "FROM_ESC_VIA_ESO_2",
          valueFrom: {
            secretKeyRef: {
              name: "esc-secret-store",
              key: "secret-2",
            },
          },
        },
      ],
    },
  },
  { provider }
);


const svc = getResource(
  podInfo.resources,
  "v1/Service",
  "podinfo",
  "podinfo"
) as k8s.core.v1.Service;

export const url = pulumi.interpolate`http://${svc.status.loadBalancer.ingress[0].hostname}:9898`;
