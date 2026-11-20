// monday.com API client. Server only: the token never reaches the browser.

const API = 'https://api.monday.com/v2';
const FILE_API = 'https://api.monday.com/v2/file';
const VERSION = '2025-04';

export const BOARDS = {
  tickets: '18436511532',
  register: '18436511524',
  sites: '18436511522',
} as const;

export const GROUPS = {
  triage: 'group_mm8ba8qc', // Support Tickets: New and in triage
  mobil: 'group_mm8baqwb', // Screen Register: Mobil
} as const;

export const STATUS = {
  closed: 19,
  cancelled: 17,
} as const;

function token(): string {
  const t = process.env.MONDAY_TOKEN;
  if (!t) throw new Error('MONDAY_TOKEN is not set');
  return t;
}

export class MondayError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'MondayError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token(), 'API-Version': VERSION },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MondayError(`monday responded ${res.status}`, json);
  if (json.errors?.length) throw new MondayError(json.errors.map((e: { message: string }) => e.message).join('; '), json.errors);
  if (json.error_message) throw new MondayError(json.error_message, json);
  return json.data as T;
}

// Upload one file to a file column. multipart/form-data with the GraphQL "map" convention.
export async function addFile(itemId: string, columnId: string, bytes: ArrayBuffer, filename: string, type: string): Promise<string> {
  const form = new FormData();
  form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${Number(itemId)}, column_id: "${columnId}", file: $file) { id } }`);
  form.append('map', JSON.stringify({ image: 'variables.file' }));
  form.append('image', new Blob([bytes], { type }), filename);
  const res = await fetch(FILE_API, {
    method: 'POST',
    headers: { Authorization: token(), 'API-Version': VERSION },
    body: form,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MondayError(`monday file upload responded ${res.status}`, json);
  if (json.errors?.length) throw new MondayError(json.errors.map((e: { message: string }) => e.message).join('; '), json.errors);
  return String(json.data?.add_file_to_column?.id ?? '');
}
