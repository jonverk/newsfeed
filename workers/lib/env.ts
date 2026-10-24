export type AppEnv = Env & { NEWSFEED_TOKEN: string };
export const tokenFor = (env: AppEnv) => env.NEWSFEED_TOKEN;
