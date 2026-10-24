import { api } from "../workers/api/app";
import type { AppEnv } from "../workers/lib/env";

export default { fetch: api.fetch } as ExportedHandler<AppEnv>;
