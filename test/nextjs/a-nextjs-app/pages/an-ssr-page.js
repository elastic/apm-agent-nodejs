// A server-side rendered page.

import Header from "../components/Header"

// Gets called on every request.
export async function getServerSideProps() {
  return {
    props: {
      currTime: Date.now()
    }
  }
}

function AnSSRPage({ currTime }) {
  throw new Error('XXX boom')
  return (
    <>
      <Header/>
      <main>
        <div>AnSSRPage (currTime is {new Date(currTime).toISOString()})</div>
      </main>
    </>
  )
}

export default AnSSRPage
