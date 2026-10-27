export type AppEnv = Env & {
  NEWSFEED_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};
export const tokenFor = (env: AppEnv) => env.NEWSFEED_TOKEN;
