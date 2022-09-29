/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A page that throws in `getServerSideProps`.
// https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props#does-getserversideprops-render-an-error-page

import Header from '../components/Header'

// Gets called on every request.
export async function getServerSideProps () {
  throw new Error('AnSSRErrorPage thrown error')
}

function AnSSRErrorPage ({ currTime }) {
  return (
    <>
      <Header/>
      <main>
        <div>AnSSRErrorPage (currTime is {new Date(currTime).toISOString()})</div>
      </main>
    </>
  )
}

export default AnSSRErrorPage
