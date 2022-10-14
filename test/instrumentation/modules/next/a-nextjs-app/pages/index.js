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
              <a>Go to APage (it is static in a prod build because it only implements getStaticProps)</a>
            </Link>
          </li>
          <li>
            <Link href="/an-ssr-page">
              <a>Go to AnSSRPage (its getServerSideProps is called on the server every time)</a>
            </Link>
          </li>
          <li>
            <Link href="/a-dynamic-page/42">
              <a>Go to ADynamicPage/42 (it supports other numbers; 41, 42, and 43 are pre-generated)</a>
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/redirect-to-a-page">
              <a>Go to a page that redirects to APage</a>
            </Link>
          </li>
          <li>
            <Link href="/rewrite-to-a-page">
              <a>Go to a page that rewrites to APage</a>
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/api/an-api-endpoint">
              <a>Go to AnApiEndpoint</a>
            </Link>
          </li>
          <li>
            <Link href="/api/a-dynamic-api-endpoint/3.14159">
              <a>Go to ADynamicApiEndpoint/3.14159</a>
            </Link>
          </li>

          <li style={{ marginTop: '10px' }}>
            <Link href="/a-throw-in-page-handler">
              <a>Go to AThrowInPageHandler</a>
            </Link>
          </li>
          <li>
            <Link href="/a-throw-in-getServerSideProps">
              <a>Go to AThrowInGetServerSideProps</a>
            </Link>
          </li>
          <li>
            <Link href="/api/an-api-endpoint-that-throws">
              <a>Go to AnApiEndpointThatThrows</a>
            </Link>
          </li>
        </ul>
      </main>
    </>
  )
}

export default IndexPage
