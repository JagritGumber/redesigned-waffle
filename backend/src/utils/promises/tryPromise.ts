type PromiseResult<T, E = Error> = [T, null] | [null, E];

export default async function tryPromise<T, E extends Error = Error>(
  promise: Promise<T>
): Promise<PromiseResult<T, E>> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error as E];
  }
}
