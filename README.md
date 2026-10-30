# Diana Phone Shop

The React frontend and Express API are served from one origin.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Vite hot reloading and the `/api/health` endpoint are served by the same server.

## Production

```sh
npm run build
npm start
```

Set `PORT` to choose the listening port. The production server serves the built frontend and API on that port.
