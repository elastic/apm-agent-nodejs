/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

import Link from 'next/link'
import Header from '../components/Header'

function IndexPage () {
  return (
    <>
      <Header/>
      <main>
        <div>Welcome to A-Next.js-App! This is IndexPage.</div>
        <ul>
          <li>
            <Link href="/a-page">
              Go to APage (it is static in a prod build because it only implements getStaticProps)
            </Link>
          </li>
          <li>
            <Link href="/an-ssr-page">
              Go to AnSSRPage (its getServerSideProps is called on the server every time)
            </Link>
          </li>
          <li>
            <Link href="/a-dynamic-page/42">
              Go to ADynamicPage/42 (it supports other numbers; 41, 42, and 43 are pre-generated)
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/redirect-to-a-page">
              Go to a page that redirects to APage
            </Link>
          </li>
          <li>
            <Link href="/rewrite-to-a-page">
              Go to a page that rewrites to APage
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/api/an-api-endpoint">
              Go to AnApiEndpoint
            </Link>
          </li>
          <li>
            <Link href="/api/a-dynamic-api-endpoint/3.14159">
              Go to ADynamicApiEndpoint/3.14159
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/a-throw-in-page-handler">
              Go to AThrowInPageHandler
            </Link>
          </li>
          <li>
            <Link href="/a-throw-in-getServerSideProps">
              Go to AThrowInGetServerSideProps
            </Link>
          </li>
          <li>
            <Link href="/api/an-api-endpoint-that-throws">
              Go to AnApiEndpointThatThrows
            </Link>
          </li>
        </ul>
      </main>
    </>
  )
}

export default IndexPage
