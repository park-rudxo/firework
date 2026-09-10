import "server-only";
export const MATTERMOST_ORIGIN = "https://meeting.ssafy.com";
export function mattermostOAuthConfigured() {
  return Boolean(process.env.MATTERMOST_CLIENT_ID?.trim() && process.env.MATTERMOST_CLIENT_SECRET?.trim());
}
export function mattermostDeliveryConfigured() {
  return Boolean(process.env.MATTERMOST_BOT_TOKEN?.trim() && process.env.MATTERMOST_BOT_USER_ID?.trim() && process.env.CRON_SECRET?.trim());
}

