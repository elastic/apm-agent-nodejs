/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A static page.

/* eslint-disable no-unused-vars */
import Image from 'next/image';
import Header from '../components/Header';

import img from '../public/elastic-logo.png';

// Runs at build time.
export async function getStaticProps() {
  return {
    props: {
      buildTime: Date.now(),
    },
  };
}

function APage({ buildTime }) {
  return (
    <>
      <Header />
      <main>
        <div>This is APage (built at {new Date(buildTime).toISOString()})</div>
        <Image src={img} width="300" alt="Elastic logo" />
      </main>
    </>
  );
}

export default APage;
