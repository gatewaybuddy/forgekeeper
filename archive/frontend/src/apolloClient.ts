import { ApolloClient, InMemoryCache, ApolloLink, HttpLink, makeVar, NormalizedCacheObject } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { notifyError } from './toast';

export const pendingRequestsVar = makeVar(0);
export const projectIdVar = makeVar<string | null>(null);

declare global {
  interface Window {
    __APP_CONFIG__?: {
      BACKEND_URL?: string;
    };
  }
}

const runtimeBackendUrl = typeof window !== 'undefined' ? window.__APP_CONFIG__?.BACKEND_URL : undefined;
const envBackendUrl = import.meta.env?.VITE_BACKEND_URL as string | undefined;
const backendBaseUrl = runtimeBackendUrl || envBackendUrl || '';

const graphqlUri = backendBaseUrl
  ? backendBaseUrl.trim().endsWith('/graphql')
    ? backendBaseUrl.trim()
    : `${backendBaseUrl.trim().replace(/\/$/, '')}/graphql`
  : '/graphql';

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message }) => notifyError(message));
  }
  if (networkError) {
    notifyError(networkError.message);
  }
  client.resetStore();
});

const syncLink = new ApolloLink((operation, forward) => {
  pendingRequestsVar(pendingRequestsVar() + 1);
  return forward(operation).map(result => {
    pendingRequestsVar(pendingRequestsVar() - 1);
    return result;
  });
});

const projectLink = new ApolloLink((operation, forward) => {
  const projectId = projectIdVar();
  if (projectId) {
    operation.variables = { ...operation.variables, projectId };
  }
  return forward(operation);
});

const httpLink = new HttpLink({ uri: graphqlUri });

const client: ApolloClient<NormalizedCacheObject> = new ApolloClient({
  link: ApolloLink.from([errorLink, syncLink, projectLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
