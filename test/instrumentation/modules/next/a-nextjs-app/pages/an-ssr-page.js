/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A server-side rendered page.

/* eslint-disable no-unused-vars */
import Header from '../components/Header';

// Gets called on every request.
export async function getServerSideProps() {
  return {
    props: {
      currTime: Date.now(),
    },
  };
}

function AnSSRPage({ currTime }) {
  return (
    <>
      <Header />
      <main>
        <div>
          This is AnSSRPage (currTime is {new Date(currTime).toISOString()})
        </div>
      </main>
    </>
  );
}

export default AnSSRPage;
