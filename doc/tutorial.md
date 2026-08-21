# Tutorial: your first Meetup query

This tutorial takes you from an empty folder to a script that
reads and writes meetup data through
Seneca entities. It should take about fifteen minutes.

You will build one script and add to it as you go. Everything runs in
memory: the SDK ships an offline mode backed by a small in-memory
store, and you supply that store's contents yourself. No request leaves
your machine, so nothing here can affect anything outside it.

You need [Node.js](https://nodejs.org) 24 or later. You do not need a
server, a network connection, or credentials.

## Step 1: Create the project

```sh
$ mkdir meetup-demo
$ cd meetup-demo
$ npm init -y
$ npm install seneca seneca-entity seneca-promisify @seneca/provider @seneca/meetup-provider
```

The first four are the Seneca host: the framework itself, the entity
API, the promise wrapper that makes calls awaitable, and the shared
machinery every Seneca provider is built on. The last is this plugin,
which brings the meetup SDK with it.

## Step 2: Connect

Create `demo.js`:

```js
const Seneca = require('seneca')

// The offline store. Each key under an entity name is that record's
// id, and each record is what the API would have answered with.
const SEED = {
  entity: {
    event: {
      event0: {"dateTime":"dateTime0","eventUrl":"eventUrl0","id":"event0","status":"status0","title":"title0","group_urlname":"group_urlname0"},
      event1: {"dateTime":"dateTime1","eventUrl":"eventUrl1","id":"event1","status":"status1","title":"title1","group_urlname":"group_urlname0"},
    },
  },
}

async function main() {
  const seneca = await Seneca({ legacy: false })
    .use('promisify')
    .use('entity')
    .use('provider', {
      provider: {
        meetup: {
          keys: {
            apikey: { value: '' },
          },
        },
      },
    })
    .use('@seneca/meetup-provider', {
      test: true,
      testopts: SEED,
    })
    .ready()

  const info = await seneca.post('sys:provider,provider:meetup,get:info')
  console.log(info)
}

main()
```

Run it:

```sh
$ node demo.js
```

You should see:

```js
{
  ok: true,
  name: 'meetup',
  version: '0.0.1',
  sdk: { name: '@voxgig-sdk/meetup', version: '0.0.1' },
}
```

Two details of that configuration are worth a moment. The `apikey` is
declared even though nothing here asks for credentials — an empty
value simply means no `authorization` header is sent. Every Seneca
provider is configured the same way, so an application that later moves
to an authenticated service changes one value rather than its shape.
And `get:info` is answered by the plugin itself, without calling the
API, so a reply tells you the plugin loaded and initialised before any
request goes anywhere.

## Step 3: List the event records

Event records live inside a parent record in the API,
and the route says so:

`events`

The parent id there is not optional, so every event call
carries `group_urlname` in its query. Leave it out and the provider
names the key you missed, rather than letting a half-built URL come
back as a puzzling 404.

Replace the `console.log(info)` line with:

```js
  const events = await seneca
    .entity('provider/meetup/event')
    .list$({ group_urlname: '0' })

  console.log('Found ' + events.length + ' event record(s):')
  events.forEach((r) => {
    console.log('  ' + r.id + '  ' + r.dateTime + '  ' + r.eventUrl)
  })
```

Run it again and you will see the two event
records you seeded, under the ids they are filed by.

No URL, no HTTP verb, no JSON parsing. You asked a Seneca entity for
a list, the provider turned that into an SDK call, and the SDK turned
it into a request. These are ordinary Seneca entities, so everything
you already know about the entity API applies to them.

## Step 4: Load one event

Add:

```js
  const one = await seneca
    .entity('provider/meetup/event')
    .load$({ group_urlname: '0', id: 'event0' })

  console.log('loaded', one.id, one.dateTime)
```

`list$` gives you many, `load$` gives you one. Now ask for
something that is not there:

```js
  const missing = await seneca
    .entity('provider/meetup/event')
    .load$({ group_urlname: '0', id: 'nosuchevent' })

  console.log('missing =', missing)   // null
```

You get `null`, not an exception. "There is no such
event" is an ordinary answer to a lookup, so it does not
interrupt your code.

## Step 5: Create, change and remove

Everything so far has been reading. This entity accepts writes too,
so add:

```js
  // Create: make$ builds an entity, save$ persists it.
  let event = await seneca
    .entity('provider/meetup/event')
    .make$({ group_urlname: '0', dateTime: 'tutorial-dateTime', eventUrl: 'tutorial-eventUrl', status: 'tutorial-status', title: 'tutorial-title' })
    .save$()

  console.log('created with id', event.id)
```

Run it, and note the id printed. It is **not** one you chose — the
store assigns ids itself and ignores any you send. That is worth
knowing before you write code that assumes otherwise.

Now change it. An entity that already carries an id is an update
rather than a create, and `save$` decides between the two on exactly
that:

```js
  event.dateTime = 'tutorial-dateTime-2'
  event = await event.save$()

  console.log('updated:', event.dateTime)
```

This entity declares no remove operation, so the record you have just
created stays where it is.

Those are the only methods there are:

`list$`, `load$`, `save$`

They behave the same way on every entity this plugin exposes.

## Talking to a real server

The script you have just written never touched the network. To point it
at a running meetup server instead, replace the `test` and
`testopts` options with that server's base URL:

```js
    .use('@seneca/meetup-provider', {
      sdk: { base: 'https://api.example.com' },
    })
```

Nothing else in the script changes — the entity calls are the same
calls. Your seeded ids will not exist there, so read the ids you need
from a `list$` first.

## What you have learned

You built a script that reads and writes
meetup data through Seneca entities,
with no server involved. Along
the way you saw:

- Provider configuration has the same shape even when no credentials
  are needed.
- API resources are Seneca entities under `provider/meetup/`,
  reached with the entity API you already know.
- A resource nested under another in the API needs its parent's id in
  every query, and says which key is missing when you forget.
- `load$` answers `null` for something that is not there, rather
  than throwing.
- `save$` creates without an id and updates with one, and the
  store chooses the id.
- The offline store makes all of this runnable with nothing installed
  but npm packages, which is also how you test your own code.

## Where to go next

- To do a specific job — point at a real server, reach the raw SDK,
  test your own code — see the [how-to guides](how-to.md).
- To look up an exact pattern, field or option, see the
  [reference](reference.md).
- To understand why the plugin is built this way — why entities rather
  than one message per route, and what it does with the SDK's answers
  — see the [explanation](explanation.md).
- For what each of these documents is for, see the
  [documentation index](README.md).
