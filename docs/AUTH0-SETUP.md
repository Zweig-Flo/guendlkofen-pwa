# Auth0 Setup

The API reads two namespaced custom claims from the access token to provision the local
user record (`UsersService.provisionFromToken`):

- `https://guendlkofen.app/email`
- `https://guendlkofen.app/name`

## Post-login Action

Add a custom **Action** in Auth0 (Actions → Library → Create Action → "Login / Post Login")
and attach it to the **Login** flow:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://guendlkofen.app';
  if (event.user.email) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  }
  if (event.user.name) {
    api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
  }
};
```

Without the Action, login still works — the local user is created from `sub` alone, just
without email/name.

## Super admins

Set `SUPER_ADMIN_EMAILS` in `apps/api/.env` to a comma-separated list of emails; users whose
token email matches are promoted to super admin on login (and stay super admin afterwards).
