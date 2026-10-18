# Contributing

Thanks for wanting to help RGW! Please read this first.

[中文版](./CONTRIBUTING.md)

## Inclusion criteria (must read)

RGW only lists **manually verified** official websites. Before submitting, confirm:

1. **It's the official site**: the product/company/org's own official website — not a reseller, distributor, or fan site
2. **It loads**: you personally opened it in a browser and it works
3. **Not blacklisted**: no download portals, cracks, mirrors, phishing, pirated content, or adult/grey sites
4. **Not a duplicate**: search `sites.js` first to make sure it's not already listed

## Submitting a new site

Submit a PR editing `sites.js` directly, appending under the right country/category:

```js
{name:"Example", url:"https://www.example.com/", cat:"Software", region:"US", desc:"One-line description", kw:"example", rating:4, price:"Free", official:true, plat:"Web"},
```

| Field | Description |
|-------|-------------|
| `name` | Official name (Chinese official name preferred; otherwise original English name) |
| `url` | Official URL (https preferred, trailing `/`) |
| `cat` | Category (one of the 15 fixed categories) |
| `region` | Country code (CN/US/JP… see existing codes in the db) |
| `desc` | One-line description (write it yourself, objective) |
| `kw` | Search keywords (lowercase, name + domain, e.g. `"wechat weixin"`) |
| `rating` | 1–5 (4 is standard, 5 only for household names) |
| `price` | "Free" or actual price |
| `official` | always `true` |
| `plat` | "Web" / "Windows" / "macOS" etc. |

**Icon**: please include the site's favicon as `icons/www.{host}.ico`.

**Evidence**: in the PR description, write one line on how you confirmed it's the official site (e.g. Wikipedia outbound link, official social bio link, app store developer match).

## Translations

UI strings live in the `I18N` dict in `index.html`. Small languages fall back to English — help complete them!

- Brand name `小产品实验室` always stays in Chinese, never translate it
- Mention which language(s) you're fluent in when submitting

## Issues

- Found a fake/phishing site? Use the "Feedback" → "Report fake site" entry on the website — faster than an issue.
- Feature requests / bugs: open an issue with clear repro steps.

## PR process

1. Fork, branch, commit
2. Follow the format above
3. Maintainer manually opens and verifies every new site before merging

> Maintainer has final say. PRs that don't meet the criteria will be closed — please don't resubmit.
