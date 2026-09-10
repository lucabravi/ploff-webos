# Settings backup boundary review

## Decision

Retain backup interaction inside `SettingsController`; retain persistence inside
`PlexSettingsBackupStore`. Do not add a feature owner solely to shorten a file.
The September 6 review is complete, with focused lifecycle corrections rather
than the previously considered extraction.

The interaction is not an independent Settings screen. `promptSettingsLoad()` is
also called by first-run setup while Settings is closed. Both entry points must
use the same save/publish/theme/accessibility/translation/navigation sequence.
Moving that sequence into another owner would either duplicate Settings policy or
require callbacks back into the existing owner without removing responsibility.
The persistence boundary already exists: the backup store and interchange format
own serialized data, saved-device identity, and compatibility import rules.

A future extraction would be justified if backup interaction gains an independent
screen/lifecycle or more consumers. It should receive a single apply-loaded-settings
port, not the whole Settings controller or application. The tests below now provide
a behavior-level boundary for that work. No extraction is required for deferred
Player startup, and this review does not change the Settings feature contract.

## Reproduced problems and changes

The new interaction suite uses the real Settings controller, Settings validation,
ChoiceDialogController, and TextInputDialog, with a rendering-only choice view and
an explicitly deferred backup-service boundary. It reproduced these failures before
the fix:

- Destroying the name dialog synchronously called its cancellation continuation,
  which could resume first-run setup during application teardown.
- A late restore result still saved/published Settings and scheduled autosave after
  the Settings owner had been destroyed.
- Duplicate restore completion applied Settings again even though the caller's
  completion callback was already guarded.
- Retained choices could issue a load or reopen name entry after teardown.

Settings destruction now marks the owner destroyed before closing child dialogs.
Restore application is inside the existing once-only prompt completion, and
new/retained restore choices respect destruction. Ordinary user cancellation still
reports `skipped=true` exactly once; teardown is silent. A closed Settings view is
not treated as destruction, so first-run restore continues to work.

Tests against the real backup store and interchange format separately demonstrated
that suppressing only the UI continuation was insufficient: late playlist reads
could still apply local Settings/device identity or begin a remote write. The store
now ignores read results after destruction, rejects identity registration/removal
after destruction, and suppresses terminal notifications for accepted writes.

An already-started remote create/update transaction still finishes its update or
existing cleanup path, rather than deliberately leaving an empty playlist. An
already-started delete can finish silently. This preserves the existing transaction
behavior; it is not an abort/undo guarantee for remote I/O already accepted by Plex.
No new request manager, runtime dependency, storage key, migration, default, schema,
compatibility policy, or feature API was introduced.

## Regression evidence

`tests/test-settings-backup-interaction.js` covers onboarding cancellation, saved
profile cancellation, known/matching model choice, current-device direct load,
other-device naming/import, load error behavior, immediate live theme/language/text
scale/navigation application, autosave on/off, exactly-once completion/application,
and destroyed/late/reentrant dialog paths.

`tests/test-settings-backup-lifecycle.js` uses the real backup format/store to cover
late status/load/save/delete reads, late local-write suppression, destroyed entry
points, and accepted-write completion/rollback without notifying destroyed owners.
The existing Settings controller/feature, interchange-format, and saved-device
store suites remain unchanged and pass alongside these additions.

The checkpoint verification log contains fresh full verification and memory/Git
gates. Red-phase logs and final logs are also included in the checkpoint archive's
`verification/` directory. This is automated evidence, not physical-LG acceptance.
