# Physalia — Citizen Science Sighting Radar

A lightweight Progressive Web App (PWA) for collecting geo-referenced sightings of the Portuguese Man-of-War (*Physalia physalis*) along the Cantabrian coast of northern Spain. Designed to be used directly from a mobile browser on the beach — no installation required.

Although built for *Physalia physalis*, the codebase is generic enough to be adapted to any coastal species with minimal changes.

---

## Features

- **GPS localisation** — automatically captures the device's coordinates; the user can drag the map pin to correct the position manually.
- **Photo upload** — up to 3 photos per sighting; EXIF metadata (including embedded GPS tags) is stripped before upload to protect the photographer's privacy.
- **Habitat classification** — records whether the specimen was seen in the water or stranded on the beach.
- **Specimen count** — a simple dropdown (1 / 2 / 3 / 4 / more than 5).
- **Verification workflow** — all records start as unverified (`verified = false`). Researchers review them in the Supabase dashboard and mark confirmed sightings as verified. Only verified sightings appear as coloured circles on the public map; pending sightings are shown in grey without interaction.
- **Live counters** — total sightings received vs. verified, animated on the thank-you screen.
- **PWA support** — can be pinned to a mobile home screen and works offline for the UI (data submission requires a network connection).

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Vanilla HTML / CSS / JS | No framework needed |
| Maps | [Leaflet](https://leafletjs.com/) | Open source, no API key |
| Map tiles | OpenStreetMap | Free |
| Backend & database | [Supabase](https://supabase.com/) | Open source; free tier sufficient for small projects |
| Photo storage | Supabase Storage | Included in the free tier (1 GB) |
| Icons | [Phosphor Icons](https://phosphoricons.com/) | Open source |

---

## Project structure

```
physalia/
├── index.html       # App structure and three sections (welcome / register / thank-you)
├── app.js           # All logic: GPS, maps, photos, Supabase calls
├── estilos.css      # All styles — no inline CSS in HTML
├── manifest.json    # PWA manifest (name, icon, theme colour)
├── README.md        # This file
└── img/
    ├── Playa.jpg           # Welcome screen background
    ├── physalia.png        # Species logo
    ├── dibujo_carabela.jpg # Illustration used in the carousel and header
    └── mano.png            # Illustration used in the carousel
```

---

## Setup guide

### Step 1 — Create a Supabase account

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign in with GitHub (recommended) or create an account with your email.
3. Click **New project**, choose a name (e.g. `physalia`), set a database password, and select the region closest to your users.
4. Wait about 2 minutes for the project to be provisioned.

---

### Step 2 — Create the database table

1. In the Supabase sidebar go to **Table Editor → New table**.
2. Name it `avistamientos` (or any name you prefer — you will update `app.js` accordingly).
3. Add the following columns (the `id` and `created_at` columns are added automatically):

| Column name | Type | Default | Notes |
|---|---|---|---|
| `latitud` | `float8` | — | Decimal-degree latitude |
| `longitud` | `float8` | — | Decimal-degree longitude |
| `comentario` | `text` | `null` | Free-text comment |
| `num_especimenes` | `int4` | `null` | Specimen count |
| `foto_url` | `text` | `null` | URL of photo 1 |
| `foto_url2` | `text` | `null` | URL of photo 2 |
| `foto_url3` | `text` | `null` | URL of photo 3 |
| `ubicacion_carabela` | `text` | `null` | `'arena'` or `'agua'` |
| `verificado` | `bool` | `false` | Researcher-reviewed flag |

Alternatively, run this SQL in **SQL Editor → New query**:

```sql
CREATE TABLE avistamientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at          timestamptz DEFAULT now(),
  latitud             double precision NOT NULL,
  longitud            double precision NOT NULL,
  comentario          text,
  num_especimenes     integer,
  foto_url            text,
  foto_url2           text,
  foto_url3           text,
  ubicacion_carabela  text,
  verificado          boolean DEFAULT false
);
```

---

### Step 3 — Set up Row Level Security (RLS)

RLS controls who can read or write data. Enable it and create two policies:

1. In the sidebar go to **Authentication → Policies**.
2. Select the `avistamientos` table and click **Enable RLS**.
3. Add a policy for **INSERT** (anyone can submit a sighting):
   - Policy name: `Allow anonymous inserts`
   - Operation: `INSERT`
   - Target roles: `anon`
   - `WITH CHECK` expression: `true`
4. Add a policy for **SELECT** (anyone can read all records):
   - Policy name: `Allow public read`
   - Operation: `SELECT`
   - Target roles: `anon`
   - `USING` expression: `true`

> **Note:** the `verificado` flag is set to `false` by the app and can only be changed to `true` from the Supabase dashboard (or a separate admin tool), because anonymous users have no UPDATE permission.

---

### Step 4 — Create a photo storage bucket

1. In the sidebar go to **Storage → New bucket**.
2. Name it `fotos` (or any name — update `app.js` accordingly).
3. Make it **Public** so photo URLs work without authentication.
4. In **Storage → Policies**, add a policy for the `fotos` bucket:
   - Operation: `INSERT`
   - Target roles: `anon`
   - `WITH CHECK` expression: `true`

---

### Step 5 — Connect the app to your Supabase project

1. In the Supabase sidebar go to **Project Settings → API**.
2. Copy the **Project URL** and the **`anon` public key**.
3. Open `app.js` and replace the two lines at the top of section 1:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_KEY = 'your_anon_public_key_here';
```

That is all the configuration needed. The app will now read and write to your database.

---

### Step 6 — Adapt content for your species

All user-facing text is in `index.html`. Search for these placeholders and replace them:

| Placeholder | What to change |
|---|---|
| `Physalia` | Your project or species name |
| Carousel slide text | Species description, safety notes, scientific motivation |
| `img/physalia.png` | Your species logo or photo |
| `img/dibujo_carabela.jpg` | Species illustration |
| `TU_USUARIO` (×2) | Your Instagram / X handles, or remove the social block entirely |

To change the default map centre (currently Gijón, Asturias), edit these two lines in `app.js`:

```js
// Registration map (section 7)
mapaRegistro = L.map('mapa').setView([YOUR_LAT, YOUR_LNG], 14);

// Thank-you map (section 10)
mapaAgradecimiento = L.map('mapa-agradecimiento').setView([YOUR_LAT, YOUR_LNG], 8);
```

---

## Deploying on GitHub Pages

GitHub Pages serves static files for free from any public repository.

1. **Create a GitHub repository** — go to [github.com](https://github.com), click **+** → **New repository**, give it a name and make it public.

2. **Push your code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. **Enable Pages** — in the repository go to **Settings → Pages**, set **Source** to `Deploy from a branch`, choose `main` and `/ (root)`, then click **Save**.

4. After about 1 minute your app will be live at:
   ```
   https://YOUR_USERNAME.github.io/YOUR_REPO/
   ```

> **Important:** GitHub Pages serves over HTTPS automatically. This is required for the browser's Geolocation API to work on mobile devices — GPS will not function over plain HTTP.

---

## Verifying sightings

Sightings submitted through the app arrive in the Supabase database with `verificado = false`. To review them:

1. Go to **Table Editor → avistamientos** in the Supabase dashboard.
2. Inspect the photos (URLs in `foto_url`, `foto_url2`, `foto_url3`), coordinates, and comments.
3. For confirmed sightings, set `verificado = true`.

Verified sightings immediately appear as turquoise circles on the public map.

---

## License

MIT — free to use, adapt, and redistribute. A mention of the original project is appreciated but not required.