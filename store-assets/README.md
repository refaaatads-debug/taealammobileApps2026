# Ajyal Knowledge store assets

This folder contains editable source files for the store-listing image set. The
six screenshots are separated by role: 01–03 show student screens, and 04–06
show teacher screens. It is separate from the Expo app and does not change app
behavior, native settings, or production data.

## Regenerate

Run from the workspace root (system Chromium and ImageMagick are required):

```sh
node store-assets/source/render.mjs
```

The generator uses the system Chromium binary and writes rendered files to
`generated-artifacts/store-assets/`. That output is intentionally excluded from
Git and Replit deployments. The generated package includes a copy of these
sources, so it can also be edited and regenerated outside this workspace.

The phone screens are isolated, local-only visual demonstrations based on
existing mobile app screens. All names, dates, and lesson details shown are
synthetic. The images do not connect to Supabase, the API, or production.

Screenshot filenames preserve the role and order in every platform-size folder.

`source/brand-mark.png` is a tightly cropped copy of the configured app mark;
`source/original-app-mark.png` preserves the original image file unchanged.
The rendered screens use Cairo, matching the Arabic font loaded by the app.
