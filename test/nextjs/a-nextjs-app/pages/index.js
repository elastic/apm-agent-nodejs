/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

import Link from 'next/link'
import Header from '../components/Header'

function Home () {
  return (
    <>
      <Header/>
      <main>
        <div>Welcome to A-Next.js-App!</div>
        <ul>
          <li>
            <Link href="/">
              <a>Go to the homepage</a>
            </Link>
          </li>
          <li>
            <Link href="/a-page">
              <a>Go to APage (it should be static because it only implements getStaticProps)</a>
            </Link>
          </li>
          <li>
            <Link href="/a-page-redirect">
              <a>Go to a page that redirects to APage</a>
            </Link>
          </li>
          <li>
            <Link href="/a-page-rewrite">
              <a>Go to a page that rewrites to APage</a>
            </Link>
          </li>
          <li>
            <Link href="/an-ssr-page">
              <a>Go to AnSSRPage</a>
            </Link>
          </li>
          <li>
            <Link href="/an-ssr-error-page">
              <a>Go to AnSSRErrorPage</a>
            </Link>
          </li>
          <li>
            <Link href="/a-dynamic-page/42">
              <a>Go to ADynamicPage 42</a>
            </Link>
          </li>
          <li>
            <Link href="/api/an-api-endpoint">
              <a>Go to AnApiEndpoint</a>
            </Link>
          </li>
          <li>
            <Link href="/api/an-api-endpoint-that-throws">
              <a>Go to AnApiEndpointThatThrows</a>
            </Link>
          </li>
          <li>
            <Link href="/api/a-dynamic-api-endpoint/3.14159">
              <a>Go to ADynamicApiEndpoint/3.14159</a>
            </Link>
          </li>
        </ul>
      </main>
    </>
  )
}

export default Home
