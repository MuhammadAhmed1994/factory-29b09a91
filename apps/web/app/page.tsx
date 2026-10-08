// Written by the factory so `/` never answers 404. The web foundation task replaces it with a
// redirect to the primary screen (or to sign-in when the app needs a session).
export default function Home() {
  return (
    <main>
      <h1>App</h1>
    </main>
  )
}
