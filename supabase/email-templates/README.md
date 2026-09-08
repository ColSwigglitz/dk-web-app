# Weekly NFL Draft auth email templates

These templates are for the hosted Supabase Authentication email editor.

| Flow | Subject | File |
| --- | --- | --- |
| Confirm sign up | Confirm your Weekly NFL Draft account | `confirm-signup.html` |
| Invite user | You’re invited to Weekly NFL Draft | `invite-user.html` |
| Magic link / OTP | Your Weekly NFL Draft sign-in link | `magic-link.html` |
| Change email address | Confirm your new Weekly NFL Draft email | `change-email.html` |
| Reset password | Reset your Weekly NFL Draft password | `reset-password.html` |
| Reauthentication | `{{ .Token }}` is your Weekly NFL Draft verification code | `reauthentication.html` |

The button links use Supabase's `{{ .ConfirmationURL }}` variable so the hosted static app can receive the verified session without adding a callback route. Keep Resend click tracking disabled because rewritten authentication links may fail.
