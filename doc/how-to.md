# How-to guides

Each guide here solves one problem, and assumes you already have a
working Seneca instance with this plugin loaded. If you do not, work
through the [tutorial](tutorial.md) first.

These guides show what to do and leave out the reasoning — that is in the
[explanation](explanation.md), and the exact patterns, fields and options
are listed in the [reference](reference.md).

- [List the records of an entity](#list-the-records-of-an-entity)
- [Read one record by id](#read-one-record-by-id)
- [Create a record](#create-a-record)
- [Update a record](#update-a-record)
- [Work with nested entities](#work-with-nested-entities)
- [Run offline, without a server](#run-offline-without-a-server)
- [Point at a different server](#point-at-a-different-server)
- [Send an API key](#send-an-api-key)
- [Check which plugin and SDK are running](#check-which-plugin-and-sdk-are-running)
- [Reach the SDK directly](#reach-the-sdk-directly)
- [Develop against a local SDK checkout](#develop-against-a-local-sdk-checkout)
- [Run the test suite](#run-the-test-suite)
- [Build and release](#build-and-release)

## List the records of an entity

Every resource this plugin covers is a Seneca entity under
`provider/meetup/`, so listing one is `list$`:

```js
const events = await seneca
  .entity('provider/meetup/event')
  .list$({ group_urlname: '0' })
```

You get an ordinary array of Seneca entities back, so `length`, `map`
and `data$()` behave exactly as they do for any other store.

Fields in the query travel to the API as match criteria. Seneca's own
directives — `sort$`, `limit$` and the rest — are stripped before the
call, because they are features of a database store and not of an HTTP
API. If you need ordering or paging, ask the API for it using fields it
recognises, or sort the returned array yourself.

An entity nested under a parent in the API path cannot be listed without
the parent's id; see [Work with nested entities](#work-with-nested-entities).

## Read one record by id

`load$` answers a single record:

```js
const event = await seneca
  .entity('provider/meetup/event')
  .load$({ group_urlname: '0', id: 'event0' })
```

A record that is not there comes back as `null`. It is not an error and
it does not throw, so test the value rather than wrapping the call:

```js
const missing = await seneca
  .entity('provider/meetup/event')
  .load$({ group_urlname: '0', id: 'nosuch' })

if (null == missing) {
  // no such event
}
```

Everything else that can go wrong — a network failure, a 5xx, a rejected
key — does throw, so an unhandled rejection still means something is
genuinely wrong.

## Create a record

`make$` builds an entity and `save$` writes it. An entity with no id
is a create:

```js
const event = await seneca
  .entity('provider/meetup/event')
  .make$({ dateTime: 'dateTime0', eventUrl: 'eventUrl0', status: 'status0', title: 'title0', group_urlname: 'group_urlname0' })
  .save$()

console.log(event.id)
```

Note that `group_urlname` travels in the DATA for a write,
not in a query: a `event` is created inside its parent.

`save$` resolves to the record as the API returned it, which is the only
reliable source of the id. Read it from there rather than predicting it:
what an API does with an id you supply on create is its own business, and
several ignore it entirely.

## Update a record

The same call updates. `save$` dispatches on the id: an entity carrying
one is an update, an entity without one is a create. So the safe shape is
load, change, save:

```js
const event = await seneca
  .entity('provider/meetup/event')
  .load$({ group_urlname: '0', id: 'event0' })

event.dateTime = 'dateTime-changed'

await event.save$()
```

Mutating the record you loaded sends it as it stood plus your change, so
you do not depend on how the API treats a request that omits fields —
some merge, some replace.

## Work with nested entities

Some resources live inside a parent, and the API path says so — the
route for `event` is:

```
events
```

So a `event` cannot be addressed at all without its parent's id, and
the provider requires those keys on every command.

- `event` requires `group_urlname`

For reads the keys go in the query; for writes they go in the data:

```js
await seneca.entity('provider/meetup/event').list$({ group_urlname: '0' })

await seneca.entity('provider/meetup/event')
  .load$({ group_urlname: '0', id: 'event0' })

await seneca.entity('provider/meetup/event')
  .make$({ dateTime: 'dateTime0', eventUrl: 'eventUrl0', status: 'status0', title: 'title0', group_urlname: 'group_urlname0' })
  .save$()
```

Leave a key out and the call throws at once, naming what is missing:

```
@seneca/meetup-provider: event list: group_urlname is required
```

That is deliberate: without it the SDK would build half a URL and the
server would answer 404, which is a much harder message to act on. The
[explanation](explanation.md) covers why this is a guard rather than a
silent default.

## Run offline, without a server

The SDK ships an in-memory mock transport. Turn it on with `test` and
seed it with `testopts`:

```js
.use('@seneca/meetup-provider', {
  test: true,
  testopts: {
    entity: {
      event: {
        event0: { dateTime: 'dateTime0', eventUrl: 'eventUrl0', id: 'event0', status: 'status0', title: 'title0', group_urlname: 'group_urlname0' },
        event1: { dateTime: 'dateTime1', eventUrl: 'eventUrl1', id: 'event1', status: 'status1', title: 'title1', group_urlname: 'group_urlname0' },
      },
    },
  },
})
```

Records are keyed by id under their entity name, and the id inside the
record has to match the key it is filed under. Every command then works
offline, not-found included: an id you did not seed answers `null`,
exactly as it would against a real server.

This is how this plugin's own suite runs, and it is the recommended way
to test application code that uses the provider: no server, no network,
and the same code path as production. See `test/seed.js`, which seeds
every entity this way.

## Point at a different server

The `sdk` option is passed straight to the `MeetupSDK`
constructor, so `base` chooses the host:

```js
.use('@seneca/meetup-provider', {
  sdk: { base: 'https://meetup.example.com' },
})
```

The API definition declares no server, so there is no default worth
relying on: set `base` explicitly, or run against the mock instead (see
[Run offline, without a server](#run-offline-without-a-server)).

## Send an API key

Credentials are not a plugin option: they come through the provider
convention, so that every provider in an application is configured the
same way. Declare the variable with `env` and set the key under this
provider's name:

```js
  .use('env', {
    var: { $MEETUP_APIKEY: String },
  })
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

Every request then carries `authorization: Bearer <apikey>`. An absent
or empty key adds no header at all, so an API that needs no credentials
is configured in exactly the same shape with an empty value — which is
why it is worth writing even when there is nothing to send. An
application that later moves to an authenticated service then changes one
value rather than its structure.

For a different scheme, set the header yourself. Headers supplied through
`sdk` win over the one the key would have set:

```js
.use('@seneca/meetup-provider', {
  sdk: { headers: { 'x-api-key': process.env.MEETUP_APIKEY } },
})
```

## Check which plugin and SDK are running

One message, and the thing to reach for when a deployment is behaving
unexpectedly:

```js
const info = await seneca.post(
  'sys:provider,provider:meetup,get:info')
```

```js
{
  ok: true,
  name: 'meetup',
  version: '0.0.1',
  sdk: { name: '@voxgig-sdk/meetup', version: '0.0.1' },
}
```

`version` is this plugin's; `sdk.version` is the SDK it is running
against. That pair is what to quote in a bug report, because the two are
released separately and most surprises live in the gap between them.

## Reach the SDK directly

The entity API covers the operations the API model declares. For
anything else — an endpoint with no entity behind it, a response header
you need to read — take the configured SDK client out of the plugin's
exports:

```js
const sdk = seneca.export('MeetupProvider/sdk')()
```

The export is a function, so call it, and it only answers after
`seneca.ready()` — that is when the plugin builds the client with the
resolved key.

SDK operations resolve to SDK ENTITY instances rather than plain data, so
read the record out with `.data()`. The provider does this for you; here
you do it yourself:

```js
const events = (await sdk.Event().list({ group_urlname: '0' }))
  .map((r) => r.data())

const one = (await sdk.Event().load({ group_urlname: '0', id: 'event0' })).data()
```

For a route the entity model does not cover at all, `direct` sends a
request and hands back the raw response:

```js
const res = await sdk.direct({
  path: 'events',
  method: 'GET',
})

if (res instanceof Error) throw res
if (!res.ok) throw (res.err || new Error('status ' + res.status))

console.log(res.data)
```

`prepare()` builds the same request without sending it, which is the
quickest way to see what the SDK would actually do — url, method, headers
and body, before anything leaves the process.

Raw data becomes a Seneca entity again through `data$`:

```js
const ent = seneca.entity('provider/meetup/event').data$(res.data)
```

## Develop against a local SDK checkout

The SDK is an ordinary published dependency, so normal use needs nothing
special:

```sh
$ npm install
```

If you are changing the SDK and this plugin together, point npm at a
local checkout instead. Clone the SDK beside this repository, at the path
this project expects, and build it — it does not commit its build output:

```sh
$ git clone https://github.com/voxgig-sdk/meetup-sdk.git \
    ../../voxgig-sdk/meetup-sdk
$ cd ../../voxgig-sdk/meetup-sdk/ts
$ npm install && npm run build
```

Then link it in, without committing the change to `package.json`:

```sh
$ npm install --no-save ../../voxgig-sdk/meetup-sdk/ts
```

npm creates a symlink, so a rebuild of the SDK is picked up here with no
reinstall:

```sh
$ ls -l node_modules/@voxgig-sdk/meetup
```

To go back to the published SDK:

```sh
$ rm -rf node_modules/@voxgig-sdk/meetup package-lock.json && npm install
```

Removing the lockfile matters. npm will happily keep resolving to the
link if the lockfile still records it and the local version satisfies the
range.

## Run the test suite

```sh
$ npm run build
$ npm test
```

The build comes first: the suite runs against `dist`, so an unbuilt
change is not the change you are testing.

The offline tests use the SDK mock and always run.

Coverage, and a single test by name:

```sh
$ npm run test-coverage
$ TEST_PATTERN=event-load npm run test-some
```

## Build and release

```sh
$ npm run build      # tsc --build src test
$ npm run watch      # the same, in watch mode
$ npm run reset      # clean, install, build, test
```

Releasing follows the Seneca convention, in one command — clean, install,
build, test, tag from `package.json`, publish:

```sh
$ npm run repo-publish
```

Only `dist`, the TypeScript sources and the licence file are published;
the test suite and its build output stay in the repository.

Before publishing, check that `package.json` still depends on the
published SDK by version range and not on a local path: a `file:`
dependency left behind from local development installs perfectly on your
own machine and cannot be resolved by anybody else.

One last thing: this repository is GENERATED from the meetup API
model by [@voxgig/sdkgen](https://github.com/voxgig/sdkgen). An edit made
here survives exactly as long as the next generation run. Change the
model, or the components that build this target, and regenerate.
