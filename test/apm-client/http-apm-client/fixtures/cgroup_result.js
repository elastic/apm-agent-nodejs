/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = {
  entries: [
    {
      id: '14',
      groups: 'pids',
      path: '/kubepods/kubepods/besteffort/pod0e886e9a-3879-45f9-b44d-86ef9df03224/244a65edefdffe31685c42317c9054e71dc1193048cf9459e2a4dd35cbc1dba4',
      controllers: ['pids'],
      containerId:
        '244a65edefdffe31685c42317c9054e71dc1193048cf9459e2a4dd35cbc1dba4',
      podId: '0e886e9a-3879-45f9-b44d-86ef9df03224',
    },
    {
      id: '13',
      groups: 'cpuset',
      path: '/kubepods/pod5eadac96-ab58-11ea-b82b-0242ac110009/7fe41c8a2d1da09420117894f11dd91f6c3a44dfeb7d125dc594bd53468861df',
      controllers: ['cpuset'],
      containerId:
        '7fe41c8a2d1da09420117894f11dd91f6c3a44dfeb7d125dc594bd53468861df',
      podId: '5eadac96-ab58-11ea-b82b-0242ac110009',
    },
    {
      id: '12',
      groups: 'freezer',
      path: '/kubepods.slice/kubepods-pod22949dce_fd8b_11ea_8ede_98f2b32c645c.slice/docker-b15a5bdedd2e7645c3be271364324321b908314e4c77857bbfd32a041148c07f.scope',
      controllers: ['freezer'],
      containerId:
        'b15a5bdedd2e7645c3be271364324321b908314e4c77857bbfd32a041148c07f',
      podId: '22949dce-fd8b-11ea-8ede-98f2b32c645c',
    },
    {
      id: '11',
      groups: 'devices',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['devices'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '10',
      groups: 'perf_event',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['perf_event'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '9',
      groups: 'memory',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['memory'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '8',
      groups: 'freezer',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['freezer'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '7',
      groups: 'hugetlb',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['hugetlb'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '6',
      groups: 'cpuset',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['cpuset'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '5',
      groups: 'blkio',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['blkio'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '4',
      groups: 'cpu,cpuacct',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['cpu', 'cpuacct'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '3',
      groups: 'net_cls,net_prio',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['net_cls', 'net_prio'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '2',
      groups: 'pids',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['pids'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
    {
      id: '1',
      groups: 'name=systemd',
      path: '/kubepods/besteffort/pod74c13223-5a00-11e9-b385-42010a80018d/34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      controllers: ['name=systemd'],
      containerId:
        '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
      podId: '74c13223-5a00-11e9-b385-42010a80018d',
    },
  ],
  containerId:
    '34dc0b5e626f2c5c4c5170e34b10e7654ce36f0fcd532739f4445baabea03376',
  podId: '74c13223-5a00-11e9-b385-42010a80018d',
};
