/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A server-side rendered page.

import Header from '../components/Header'

// Gets called on every request.
export async function getServerSideProps () {
  console.log('XXX AnSSRPage.getServerSideProps')
  return {
    props: {
      currTime: Date.now()
    }
  }
}

function AnSSRPage ({ currTime }) {
  console.log('XXX AnSSRPage')
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
