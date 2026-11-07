import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export type FakeTransportHandler = (
  config: AxiosRequestConfig,
) => Promise<Partial<AxiosResponse>> | Partial<AxiosResponse>;

export function createFakeAxiosAdapter(handler: FakeTransportHandler) {
  return async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    const result = await handler(config);
    return {
      data: result.data,
      status: result.status ?? 200,
      statusText: result.statusText ?? 'OK',
      headers: result.headers ?? {},
      config: config as AxiosResponse['config'],
    };
  };
}

export function requireLiveTestGate(environment = process.env): void {
  if (environment.SNAPPSHOP_LIVE_TEST !== 'I_UNDERSTAND_THIS_CONTACTS_A_LIVE_API') {
    throw new Error('Live SnappShop tests are disabled');
  }
}
