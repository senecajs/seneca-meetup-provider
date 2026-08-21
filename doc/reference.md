# Reference

Complete description of the interface exposed by
`@seneca/meetup-provider` version 0.0.1.

This document describes the machinery and assumes you know what you are
looking for. To learn the plugin, start with the [tutorial](tutorial.md);
for recipes, see the [how-to guides](how-to.md); for the reasoning behind
the design, see the [explanation](explanation.md). The package overview is
the [README](../README.md), and the document index is [here](README.md).

- [Requirements](#requirements)
- [Registration](#registration)
- [Options](#options)
- [Entities](#entities)
- [Action patterns](#action-patterns)
- [Plugin exports](#plugin-exports)
- [Errors](#errors)
- [Authentication keys](#authentication-keys)
- [Environment variables](#environment-variables)
- [Package scripts](#package-scripts)

## Requirements

| Item | Value |
| ---- | ----- |
| Node.js | `>=24` |
| Module format | CommonJS |
| SDK | [`@voxgig-sdk/meetup`](https://www.npmjs.com/package/@voxgig-sdk/meetup) `^0.0.1` |

The SDK is an ordinary published dependency, installed by `npm install`
like any other.

### Peer dependencies

All must be present in the host application. The accepted version ranges are
declared in this package's `package.json`.

| Package | Purpose |
| ------- | ------- |
| `seneca` | The host framework. The plugin runs inside the host's instance, never its own. |
| `seneca-entity` | The entity API the canons below are served through. |
| `seneca-promisify` | The promise-returning message API. |
| `@seneca/provider` | The provider convention, including `provider/entityBuilder`. |
| `@seneca/env` | Resolves `$`-prefixed key values from the environment. |

## Registration

The plugin name is `MeetupProvider`. It must be registered after
`entity`, `promisify` and `provider`:

```js
Seneca({ legacy: false })
  .use('promisify')
  .use('entity')
  .use('provider', { ... })
  .use('@seneca/meetup-provider', { sdk: { base: BASE } })
```

The meetup definition declares no server, so there is no default
base URL: `BASE` is the URL of the API you are talking to, and it must be
supplied through the `sdk` option.

The SDK client is constructed during plugin startup and is not available
until `seneca.ready()` resolves.

## Options

| Option | Type | Default | Effect |
| ------ | ---- | ------- | ------ |
| `sdk` | object | `{}` | Passed straight to the `MeetupSDK` constructor. Most usefully `base`. |
| `test` | boolean | `false` | Run the SDK against its in-memory mock transport instead of HTTP. |
| `testopts` | object | `{}` | Test-feature options, used only when `test` is true. `{entity: {...}}` seeds the mock. |

### `sdk`

Any option the `MeetupSDK` constructor accepts:

| Key | Effect |
| --- | ------ |
| `base` | Base URL for API requests. There is no default: this API declares no server, so it must be set. |
| `prefix` / `suffix` | URL fragments placed around the path. |
| `headers` | Headers sent on every request. These win over the `authorization` header the provider adds from a configured key. |
| `system` | System overrides, e.g. a custom `fetch`. |

### `test` and `testopts`

```js
.use('@seneca/meetup-provider', {
  test: true,
  testopts: {
    entity: {
      event: { event0: {"dateTime":"dateTime0","eventUrl":"eventUrl0","id":"event0","status":"status0","title":"title0","group_urlname":"group_urlname0"} },
    },
  },
})
```

Mock records are keyed by id under their entity name. In this mode no
network calls are made, and an unseeded id produces the same not-found
behaviour as a live server. This package's own `test/seed.js` is generated
in exactly this shape.

A nested record's parent key must name a record the parent entity also
seeds: the mock resolves the path literally, so an unmatched parent id
yields nothing rather than an error.

## Entities

The plugin registers one entity canon.
A canon carries only the commands its API operations support — an entity the
API offers no delete for has no `remove$` — so the tables below are the
whole of what each one answers.

| Seneca canon | SDK accessor | Route | Id field | Parent keys | Commands |
| ------------ | ------------ | ----- | -------- | ----------- | -------- |
| `provider/meetup/event` | `sdk.Event()` | `events` | `id` | `group_urlname` | `list$`, `load$`, `save$` |

### `provider/meetup/event`

Backed by `sdk.Event()`, whose results are `EventEntity` instances; the
provider hands Seneca the plain record from `.data()`.

`event` is nested under `events` in the API, so **every**
`event` command requires `group_urlname`. Omitting one throws —
`@seneca/meetup-provider: event <cmd>: group_urlname is required` —
before any request is made, rather than issuing one that would 404.

| Command | Query / data | Returns |
| ------- | ------------ | ------- |
| `list$(q)` | `group_urlname` **required**, plus optional match fields | Array of `event` entities. |
| `load$(q)` | `group_urlname` and `id`, both **required** | One `event`, or `null` if not found. |
| `save$()` | entity data, including `group_urlname` | Created or updated `event`. |

Required fields, as declared by the API definition. Optional fields the API
also defines are passed through unchanged in both directions.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `dateTime` | string |  |
| `eventUrl` | string |  |
| `id` | string | Id field. |
| `status` | string |  |
| `title` | string |  |
| `group_urlname` | string | Parent key. Required by every command. |

```js
const events = await seneca
  .entity('provider/meetup/event')
  .list$({ group_urlname: '...' })
const event = await seneca
  .entity('provider/meetup/event')
  .load$({ group_urlname: '...', id: '...' })
```

### Create versus update

`save$` follows the Seneca convention: an entity **without** an id is
created, an entity **with** one is updated. The provider dispatches on the
id field, so the same call does both.

```js
// Create — no id.
const event = await seneca
  .entity('provider/meetup/event')
  .make$({ group_urlname: '...', dateTime: 'dateTime-value', eventUrl: 'eventUrl-value', status: 'status-value', title: 'title-value' })
  .save$()

// Update — id present.
event.dateTime = 'dateTime-changed'
await event.save$()
```

Whether a client-supplied id survives a create is a property of the API, not
of this plugin: many assign the id themselves and ignore the one sent. Read
the id back off the returned entity rather than assuming the one you set.

### Command to SDK operation

| Seneca command | SDK call | Notes |
| -------------- | -------- | ----- |
| `list$(q)` | `.list(q)` | Query keys are passed through as match fields. |
| `load$(q)` | `.load({ ...keys })` | Only the keys the route needs are sent. |
| `save$()` on an entity with no id | `.create(data)` | Data is the entity's own fields, without Seneca metadata. |
| `save$()` on an entity with an id | `.update(data)` | |

Every SDK operation resolves to an SDK entity instance, or a list of them,
rather than raw data. The provider calls `.data()` on each and hands the
plain record to `entize`, so what comes back is an ordinary Seneca entity
under this plugin's canon, carrying none of the SDK's own markers.

### Query fields

Seneca query directives — any key ending in `$`, such as `sort$` or
`limit$` — are stripped before the query reaches the SDK. They are
instructions to a store, not match fields for the API, and are not
otherwise supported.

## Action patterns

### `sys:provider,provider:meetup,get:info`

Returns metadata about the plugin and SDK. Answered locally; makes no API
call.

```js
await seneca.post('sys:provider,provider:meetup,get:info')
```

```js
{
  ok: true,
  name: 'meetup',
  version: '0.0.1',
  sdk: {
    name: '@voxgig-sdk/meetup',
    version: '0.0.1',
  },
}
```

Both versions are read at runtime from the respective `package.json`, so
they describe what is installed rather than what was generated.

### Entity patterns

Registered by `@seneca/provider`. Normally reached through the entity API
rather than posted directly.

| Pattern |
| ------- |
| `sys:entity,zone:provider,base:meetup,name:event,cmd:list` |
| `sys:entity,zone:provider,base:meetup,name:event,cmd:load` |
| `sys:entity,zone:provider,base:meetup,name:event,cmd:save` |

### Inherited from `@seneca/provider`

| Pattern | Purpose |
| ------- | ------- |
| `sys:provider,get:key` | Fetch one named key for a provider. |
| `sys:provider,get:keymap` | Fetch all keys for a provider. |
| `sys:provider,list:provider` | List registered providers and their key names. |

## Plugin exports

### `MeetupProvider/sdk`

A function returning the configured `MeetupSDK` instance.

```js
const sdk = seneca.export('MeetupProvider/sdk')()

// Every SDK operation resolves to an SDK entity (or a list of them),
// not raw data; `.data()` gives the plain record.
const events = (await sdk.Event().list()).map((e) => e.data())

// `direct` reaches endpoints outside the entity model.
const res = await sdk.direct({ path: 'events', method: 'GET' })
```

Available only after `seneca.ready()`. Use it for SDK features the entity
API does not surface — notably `direct()` and `prepare()` for endpoints
the entity model does not cover.

## Errors

| Situation | Behaviour |
| --------- | --------- |
| `load$` for a non-existent id | Resolves to `null`. |
| A nested entity command missing a parent key | Throws before any request is made. |
| A 404 from `list$` or `save$` | Thrown. Only single-record reads and removes map a 404 to `null`. |
| Any other non-2xx response | Thrown as raised by the SDK. |
| A request that never got a response | Thrown, with `status` `-1`. |

SDK errors are `MeetupError` instances carrying
`isMeetupError: true`, a `code` (e.g. `request_status`), the
HTTP `status` at the top level (`-1` when the request never got a
response), a `notFound` flag, and a `ctx` holding the request context and
its `result` — `status`, `statusText`, `headers` and `body`. The
`null`-on-missing behaviour is triggered by `err.notFound`, not by
inspecting the status at the call site.

```js
try {
  await seneca.entity('provider/meetup/event').list$({ group_urlname: '...' })
}
catch (err) {
  console.error(err.code, err.status, err.notFound)
}
```

The missing-parent-key guard is this plugin's own, thrown before the SDK is
called at all. Its message names the entity, the command and the key:

| Entity | Message |
| ------ | ------- |
| `event` | `@seneca/meetup-provider: event <cmd>: group_urlname is required` |

where `<cmd>` is the command that was called. A key counts as missing if
it is absent, `null` or the empty string.

## Authentication keys

The plugin follows the provider convention: if an `apikey` key is
configured and non-empty, it is sent as `authorization: Bearer <apikey>`
on every request. If the provider is not registered, or the key is absent or
empty, no header is added and startup proceeds normally — an API that needs
no credential exercises the same path.

```js
  .use('provider', {
    provider: {
      meetup: {
        keys: {
          apikey: { value: '$MEETUP_APIKEY' },
        },
      },
    },
  })
```

The key is read once, during `seneca.prepare()`, by posting
`sys:provider,get:keymap,provider:meetup`. An `authorization`
header supplied through the `sdk.headers` option takes precedence over it.

## Environment variables

The plugin never reads the environment itself. These are the variables the
surrounding convention and tooling resolve:

| Variable | Read by | Purpose |
| -------- | ------- | ------- |
| `$MEETUP_APIKEY` | `@seneca/env` | Supplies the `apikey` value when the key is declared as `'$MEETUP_APIKEY'`, as above. |

## Package scripts

| Script | Action |
| ------ | ------ |
| `npm run build` | `tsc --build src test` — compiles to `dist` and `dist-test`. |
| `npm run watch` | The same, in watch mode. |
| `npm test` | Runs the `node:test` suite. |
| `npm run test-some` | Runs tests matching `$TEST_PATTERN`. |
| `npm run test-watch` | Test suite in watch mode. |
| `npm run test-coverage` | Test suite with Node's built-in coverage. |
| `npm run clean` | Removes `node_modules`, `dist`, `dist-test`, `.tsbuildinfo`, lockfiles. |
| `npm run reset` | `clean`, then install, build and test. |
| `npm run repo-tag` | Commits, tags and pushes `v<version>` taken from `package.json`. |
| `npm run repo-publish` | Clean install, then `repo-publish-quick`. |
| `npm run repo-publish-quick` | Build, test, tag, and publish to npm. |

### Repository layout

| Path | Contents |
| ---- | -------- |
| `src/` | TypeScript source, with its own `tsconfig.json`. |
| `test/` | Test suite (`.js`, run by `node:test`) and TypeScript fixtures. |
| `dist/` | Compiled source. Committed; published. |
| `dist-test/` | Compiled test fixtures. Committed; **not** published. |
| `.tsbuildinfo/` | Incremental build cache. Not committed. |
| `doc/` | This documentation. |

This repository is generated by
[@voxgig/sdkgen](https://github.com/voxgig/sdkgen) from the meetup
API definition. Anything edited here is overwritten by the next generation
run; changes belong in the model.
