'use strict'
/**
 * Test fixtures for meta data test server.
 *
 * name: allows a specific response to be loaded.
 * response: the JSON a server should respond with
 */
module.exports = {
  aws: [
    {
      name: 'default aws fixture',
      response: {
        devpayProductCodes: null,
        marketplaceProductCodes: ['1abc2defghijklm3nopqrs4tu'],
        availabilityZone: 'us-west-2b',
        privateIp: '10.158.112.84',
        version: '2017-09-30',
        instanceId: 'i-1234567890abcdef0',
        billingProducts: null,
        instanceType: 't2.micro',
        accountId: '123456789012',
        imageId: 'ami-5fb8c835',
        pendingTime: '2016-11-19T16:32:11Z',
        architecture: 'x86_64',
        kernelId: null,
        ramdiskId: null,
        region: 'us-west-2'
      }
    }
  ],
  gcp: [
    {
      name: 'default gcp fixture',
      response: {
        instance: {
          attributes: {},
          cpuPlatform: 'Intel Broadwell',
          description: '',
          disks: [
            {
              deviceName: 'astorm-temp-delete-me-cloud-metadata',
              index: 0,
              interface: 'SCSI',
              mode: 'READ_WRITE',
              type: 'PERSISTENT'
            }
          ],
          guestAttributes: {},
          hostname: 'astorm-temp-delete-me-cloud-metadata.c.elastic-apm.internal',
          id: 7684572792595385000,
          image: 'projects/debian-cloud/global/images/debian-10-buster-v20201216',
          legacyEndpointAccess: {
            0.1: 0,
            v1beta1: 0
          },
          licenses: [
            {
              id: '5543610867827062957'
            }
          ],
          machineType: 'projects/513326162531/machineTypes/e2-micro',
          maintenanceEvent: 'NONE',
          name: 'astorm-temp-delete-me-cloud-metadata',
          networkInterfaces: [
            {
              accessConfigs: [
                {
                  externalIp: '35.247.28.180',
                  type: 'ONE_TO_ONE_NAT'
                }
              ],
              dnsServers: [
                '169.254.169.254'
              ],
              forwardedIps: [],
              gateway: '10.138.0.1',
              ip: '10.138.0.2',
              ipAliases: [],
              mac: '42:01:0a:8a:00:02',
              mtu: 1460,
              network: 'projects/513326162531/networks/default',
              subnetmask: '255.255.240.0',
              targetInstanceIps: []
            }
          ],
          preempted: 'FALSE',
          remainingCpuTime: -1,
          scheduling: {
            automaticRestart: 'TRUE',
            onHostMaintenance: 'MIGRATE',
            preemptible: 'FALSE'
          },
          serviceAccounts: {
            '513326162531-compute@developer.gserviceaccount.com': {
              aliases: [
                'default'
              ],
              email: '513326162531-compute@developer.gserviceaccount.com',
              scopes: [
                'https://www.googleapis.com/auth/devstorage.read_only',
                'https://www.googleapis.com/auth/logging.write',
                'https://www.googleapis.com/auth/monitoring.write',
                'https://www.googleapis.com/auth/servicecontrol',
                'https://www.googleapis.com/auth/service.management.readonly',
                'https://www.googleapis.com/auth/trace.append'
              ]
            },
            default: {
              aliases: [
                'default'
              ],
              email: '513326162531-compute@developer.gserviceaccount.com',
              scopes: [
                'https://www.googleapis.com/auth/devstorage.read_only',
                'https://www.googleapis.com/auth/logging.write',
                'https://www.googleapis.com/auth/monitoring.write',
                'https://www.googleapis.com/auth/servicecontrol',
                'https://www.googleapis.com/auth/service.management.readonly',
                'https://www.googleapis.com/auth/trace.append'
              ]
            }
          },
          tags: [
            'http-server'
          ],
          virtualClock: {
            driftToken: '0'
          },
          zone: 'projects/513326162531/zones/us-west1-b'
        },
        oslogin: {
          authenticate: {
            sessions: {}
          }
        },
        project: {
          attributes: {
            'gke-smith-de35da35-secondary-ranges': 'services:default:default:gke-smith-services-de35da35,pods:default:default:gke-smith-pods-de35da35',
            'serial-port-enable': '1',
            'ssh-keys': 'alan_storm:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAHyZ1Hqjqn2dL/bNirbdtF1bEvWdWAmf9tDxDWha5YZ144enjp+6Zte4iILwAuCkkPhm/86MvsE6IKJMBVKPYi1gSoFsHU8xVofDmL9SaPgBh/G4w+PcB9JN8KIqo0F978fZOKfad2OGRKvXgZ0yI43lwnY05UwvWaBFpiRxcmU63RMwtv70DpAyQj+2UpCUs9ELje21qWDDnJSs59MEDnlaSUioyki/VztKygqVVcKjqA8W1qsk5BrQW0yS7kQHIfE2hnDr4U/hmLLHlutz4mwcMBkBe9Qaql4jlyxlpNuKOVKBPApHPpNNeqexnqkfDQi0MB12u2Fvbym5b1pnx/8= google-ssh {"userName":"alan.storm@elastic.co","expireOn":"2021-01-14T22:17:59+0000"}\nalan_storm:ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDHs7vOA3ycWf1C/i5CZxL73dBUY2fxH4rDXiXMWnNybX1xirLY7lv3QxeVH4zNIatF7dGCqrz3BFiMQMEms4PI= google-ssh {"userName":"alan.storm@elastic.co","expireOn":"2021-01-14T22:17:43+0000"}\ngil:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKzX+ZZBJXvK4xzHoHavFTqf0m+nDYMxf1uY1auIqK/o+HFs8xCxpP05D3DeV9vzqbK0kmfsyMoYhpB4CWNz2dimtt+nujn01Vs9KjJOF+KZOk7YOoP/tXypJZgGdaBeZn5XSccQUvLohMVIu2IJVmS/Vt8b9pzxcu1GQ273yShzSZoKi6IEM4y1eu8p105Qv6zMrBtoWhN2nJFPrwIy6F4T1B08+jmY7Las2yUJ1OjaNKtNMZnpDrLwH6UXDhvZPwtu8PhMM31wP3ewGJk57SKhzsZqDo3rIRxtC1LF0KCoR0aShE/Sd8sXdMcHfdZnsc9YZwAyzc3GcN/Ap5eXGn gil@six\ngil_raphaelli:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKzX+ZZBJXvK4xzHoHavFTqf0m+nDYMxf1uY1auIqK/o+HFs8xCxpP05D3DeV9vzqbK0kmfsyMoYhpB4CWNz2dimtt+nujn01Vs9KjJOF+KZOk7YOoP/tXypJZgGdaBeZn5XSccQUvLohMVIu2IJVmS/Vt8b9pzxcu1GQ273yShzSZoKi6IEM4y1eu8p105Qv6zMrBtoWhN2nJFPrwIy6F4T1B08+jmY7Las2yUJ1OjaNKtNMZnpDrLwH6UXDhvZPwtu8PhMM31wP3ewGJk57SKhzsZqDo3rIRxtC1LF0KCoR0aShE/Sd8sXdMcHfdZnsc9YZwAyzc3GcN/Ap5eXGn gil@six\njalvz:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCgACdIY330Q9fR7wgNmp/ZL/n5kOb0LI7ifA2S83Dpi/1899GL1wWO7SiGEFTjlQ9o678/44r3hsBftuDfEO9pnyV3t2LZ4CYeQgj8z4Yio0USy6Tc/bw90AwW4W1Ktc4ppZnVXeKt4ZcNWdrA+K3wPSakqzgE27yaPsRyfXPPFN7iIHo3PmkAjoEmgiVkb5A5bJzGjos6Vhjb8ZXgGX77oxLlq402mLns048U+1V2MP+ZMnGK77C2N04oifZbwlc0pmG6Jc0HVRuBwBRseCweOj7JjB3TW9yn9dWpYFtDMvuALrMGmN5Fb+md3X4GgrBlpHNPshb1y+R1Q5Vq8vAz jalvz@jalvzs-MacBook-Pro.local\njuan_alvarez:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7pInA2fFKxEr3P2dtixxWpks1uJlmJ8jFELpzDfBMIz1+7q7hIUgZvqBOWUaYp5lDKkwxAFu1ufmDtf2PmG1070LmywBfTZ1gPWFbhE7k/E1KlqzaF1qSmILB1vWZH3jehEQyhOei++qMUNoRsPkX336e64USj82q2lEGE2BpS4B5hp9UO7Fk5yGNejDHyIEX38Ss6/UI94tu2LV3oXSC2kz+Hg11V8UjDBpd3P758zyQY0n8tFBv2TPmIR/Hkb9emaL6Si2mmNAJNBZwoBuAvw2KcXbUV4enn4HV0YsPHDYyRRVGKxBD7tPHipUXPR+K1B/Sqzx5UBO/ngfgsn2D juan_alvarez@cs-6000-devshell-vm-2459365c-df0c-404c-8dc3-5b6536e3cc37\nron:ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAwC2GkPHLrKujR2DW0WI6evyfwrZSwnd2OcXNjMQqmuZLVx8hdZgeMbjZ2UzHmPgkgSINQsAX+hZ4TM4ZWBK2x7BSElVp21REG+Ixtr5A5g5eELgkgU4jyxaDIXWL8WoMZ9HCxg3Qj2bwi3DPETz16aOXyhkR5KXLqzIGQsGfEFxqkvmRgJkyKjbMgFzDkqcjINPcxDSGm5d6jqcEn9w7iBPYuu9IaClTc9W5AHwq7iSaPxbid3+T1xYqgP5ocv9IrHeMiKXp8SoIPsC26dQUWya/T0Uc3G/wkq7jkRye6h/bp22WlY/5wR5XpaeEMPhPQYAEnI/7bEIgrwd3mRxHTQ== ron@ron-laptop\nalvaro:ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAv5/Vq68zHTT6+98uGQ38swxEz0DuHGZDO7oKRFEP/VSuosVJfG/sSFHEbfBOT2w3xiWWOe/6m0e8nMmD2GdJ6SiKM7Y1hZeFGd7GSiIhpewozkM2wZT9JOwdnze439QoNM3H1dNqn3qc0zr/QF5Jyk8XghSi+0gjSOisz1f9wkJ24cU1oxlG8pdt5/QRZKEwZk5Ltsa9CbbZrTR4JzhV5nnohTKq345FzreuQmfU7Zekni103V0EjPhgaXgeDkBxfPI/pGwWojFzN+YQdH+23HiMiykpr5oTvTvexD5XRn0BZrstYV0rYxcIJnLus4DhrSohfLkPV4ZqZ0KXdcrfEQ== alvaro@alvaro-laptop\nron:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDaUzv85H3O/kSZpirktyh9b/ypIxr+j5bPzAyDohPQMOTixPsnucgmxGRs1X2jEbcdZ75ebKg/hXmM2zvsLXfeZKpW9eCqy8Et0rYnMzc0sP3h/P8+uPmvNCT0ElJ1jpzTV8AmF56E33WYx2QEFcP/BWOEqmDVuvVORony1cjwCc+h/2xtBexkx4bt/1mrT6nN6ZYEsKY46atf6ub84l0ufhrdeEwMHASCP9VKxpixEStY0G9h6YtHq6Y3A73icSMZJgKtXA1okOHWoUJslNwNMmzhfNnr4BAB8aC0M8Dat6n4/DXGiMFjpUhvxSsPgPD4g+EP3tgDwGtY0Ckye849 ron@Rons-MacBook-Pro.local\nsilvia.mitter:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCn9eMMwPwrp7t09Q5rEGLTf/7sspyU6wplNzldaFi2FkMmjizPGJAFmwYqyi+sLoF3Im3DLkz89WMtFc4qnDWNPj9AGmdE03aMhg9CPHi8aCkd4SJYGI0oYNJAiDdo8E9zYPdoAtLpAkaGQGvah48/tvP6il7O2HuPQC5jOeUM8WZqhegAzVwcinigKh21LRQGc6j2g/ux/HE6R1ArrcZqIUP2XzduMOOaQSFakdtaH9kbCrImejYBduKpEw1VLntdFikAnygrRZs/g3lqrJmZCMhFfi1sAj2aHw7iK1YQ6wdFueVEr1bWdiwKCyF2BLg70PYoeJzl37HXziiETPv+fqqziC1h1V87zQwWxe2XZo2eB26k6sMawtIy/oDw7utu5QHxiQvvzBg3LGU1A8jfBsI4Paq6ZPkLf8R3m24ueub/ConZslbIWp6+kWjYQwHbH8Qk1tWPlJVAvM7Rwc6ohCoLrClBJ4bFt7PXUj+nx7G72zS5YhqnOhzesm6Spyiy5Eg1Gzb02Kf9OzvJR+3xxInChuFchOJTXxqx8JvTB5hrh0CyK5J4UiwvJ524P1CPWyGA5VZJoHRSJujk1LAHQj0Y7E+rgKxV/7udxE1Wq0OK/PxWO5cz8NwqtnC1GRPjjky84XYbLtvuvG5N/wdsdyZ0kWMpEQ03W3saIYAUJQ== silvia.mitter@elastic.co\nsimitt:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCtLIKUPVI7VpJx3rFlfqHSlXo6PXYAJ5+nrNUyToF+VyBnsl4IGx+XpP3ipJwxSRjsl/jxmtGK8By/KO7M/edXXCoJ5HcR8ApFp+opCy/eyun37e3ruaNVG54K1vyS1vfjHAAEevx3K/Ki70CErtELDu/KHwi1bHqYMlPiVBjF6Wje5JvDD1INb5dNmDVfdFzPDnsj3SF5DG4Iw0SEiyQMaoGxYiWogE+5Xu7hgu98JIepd0/H5CK8X5tQUpa1Wet19KaVqfKGJ2BmJpoxdwWDe4RK+zjmETHpuvtXHfNz1wqwwPbIKAFsSQZI8tSmyntTwZirzl+fnHptSd7Fjd7P simitt@silmac.local\nsoren_louv:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDVHcHENGSWSUO21c7jnam7EPt+9Dl1S68ohxXNBtKzcT5Hs6ZAO+hMKnBoCgVzFEbyfHgKUqPvTqsHkRZ1jLxarWOw8YpjuRW+o39K0fVYUr6C6oRFmoqHWjEjceX4Nyh9+EyjBrXmHrlB1QuAU28+Er3cso+JK/JdbteNk30t/ecDUEj6Z3O7nevstxgx1TKBtPzSvH2e3YYn9LsAZY6JVbwSOGCVR2xe+OAuZppUWbfla6jjEiMg76KxsIlpJQZcx3J1Q7Pd+fG36mjhYM+FwEMs+Axh2p8RHB8PEJI+udJd7JZ8X2+gR0HvMewr5Toce9h/aIayQ5gvTPsBZ4Qd soren_louv\nandrew:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCy9eZOsADycK5NmAaBvMrZpABZHOg+6G2aFr6Q/f6UmLq70GuH8DPaR0MOy4/6m7VPLGbTNEyNqPAEk8MTTHeHzDZkA1MFVMKxtsn+52ZQ5I4GzqM+NXqPZeYljqRwDUCb3FCJYHHYP1IFcVyTf7+7zIGFD/wY5Y5NkuaRofSaLoke7k8HpmwMfmzpqfzKMeB+cd49bCy9xIsim9gvfAuCUOKKhjSBLKnazkeR51Ce3fwbBBfEWGcGU6UTOIjRNvAyB4Sb0fjq8PabsqQjQ6pcwqMwdsgLsOmhax6RwYO7Dd+x+ShVgQ9pomX74PCzgF6wzcLYdx5wHExaeAvTHArp andrew@thinko\nbenjaminwohlwend:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDD3hz5tbB28S1W3fdtDW6A8FitL7nVoFGsd/i7gjwk+onLrOp660dvsKgaUn3e5vWg58ntXvw5sRGxJw6k3mf/QOjZnmKAytNe9QTx/lnleJLErs1A74j4kIZ/sKd+Vwc/KbTHqBKI0A8ssE44N1T+FUCLEJKL9YYw5uMdC5YJwiocjCxntX//2YPhuILaMXxmchCvY32bdLk5ge3JfLyXY8cLoxr/r3r5KL2pp9/fL/O4qkvhIPqJCS7CBP28EkzGSKCduG09X6CxqrsLcI2PjumabW7BskdnXwAZvMiybxCQdk8KrAaGF4bsPmKg8H9SJZ0Kq7gbCePT/8SLSwM/ benjaminwohlwend@Benjamins-MacBook-Pro-2.local\nbeni:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDHffLcGYfoNar8sTTOqCRwDHARahP4pECkdxwa1MPKIGqyh2ev4YJpuU45DFMN1yaJqxNg2HCnhb2+Aun+LmbworjD/R8PdyDBB387pu9Ddjov2m/CIbNJrWfdNPVI/B8KsB+SSuC7E+G6GRdG8WJFgem5Hi1n8MmwSuDp5sL6lBQD/OGOtjCeKTa9uEv73/qe9ZTNelPPPydzVZns4KWLDfXFCMZ2RdoXQj3rkpB5hkexB+hYLsbBBrSXA+RW+9GaQNzcaquo2YdLIrOa4KGdnS5I/D48MLv3+rdaJmGXfpI9bYH9NjKLtGhUR+FyYyIto80t8djOUwMlcgGqAgz7 beni@X1\nsqren:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDZVwZsca5OqTWGOWkszqSqYzAbHQFHqn/c/bhzSO9l/bWyiSW4P3oLgfBSsPPt8J8zGYxG5NMFYs/PLEhh7h2E1WPXo1wZphX50teGFyg87Ec14QL7/4+pTTY3ua7f31jZpAZ7+IsAElHRsygSXS3/IUgNv25wbNlz5YZRbB1oXdCn/IeoLfvCakTMeaRSi74G61gJk1zwD2UGuIJWkJwxmkHOK0K0CJ4Pn8Nd7uoYZMK1XpwyZVivy+reUfMutf5bH9HcHex7tXHfZ1nQXQnHk1sDMLPWG9tSk2Ngsu6VSw7GAs2sq9eorTUyeDONZfZ09PmLE52rAsW+XJ11KUxV sqren@Srens-MBP\njason.rhodes:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDLXcVYnvnfLbRxxGFgc2Cwf7oI0LYft1EoNxg646/CKQJHYWClxQmADVc54k6uGARhbZ4wtMktNPEW8YGNMdQDgrfCj7hP8U/zQMgjcBgoRBV/oq+AV8fJN3MW6HvMqs0UVw1Dq1Se3w8nnkB8rvGzZatbX4IhNjkD5lfDOHO8M0wCczykrGhfNmIZ9MvlChO1mChTbiY8CMDs6cVl/dsm5N41eLog1Gl4qDhO0bSxxLpBwyWuQVMmZYYjOD4VUNgVs+MQv09GbTmH6ZfqjAoSwC91Diw8AjBefFAm5smBdLzyGVxllAmeo8KE3fdixL6XXYfJjV8h4DU/A6AJbRYPO6aofNEiQF50WKtb85V18zKUnuWko8YAcCNQe640y24C3HjeS8piOhREl3lmUcTViTJ+a1w6wEysAO48AW5HRnvcbym4W1vTHBbYvzCpQ6B8auFQwL1ghVhUbuDMiO83IQXLVmYLSzgsClceuNe/WmdURpiddCEIwCLsrGnfLzSnY3yzirHPViPW+e0Tc4Z/jIY/Si+pmJbn+5MrRmc1hShxkuLwjvYgfhiXstepSJesqUUlD+scVDP1BncpiRZo2C2vDZ+n8WsNE2V84JE1osE4B9m8TARese+MbW8Ng2nGBh9oeBrYdR048ZTgRmzvOP4P9IsT87G3tO8p6u0YKQ== jason.rhodes@elastic.co\nogupte:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCrmx81JYQGMKVYd/SheVgmRTfAj3ZjJKv4TBV9tUO+FLq5BpZ8QvMrfKzUM2HfmvCif1CX2L7eGRYl6GMQ7KCXviKFwxeNx929mIlVohvLf+BpXd36S0PoYc86HO0AsCrAxdfYb2ywAlYQ/BnjEtPy9t7RhzEPDOGVN7n3BrquniM+EXX3CSZ3Qfzu7Iz0iOK31KrAYQoq4b5I3bx++FkJzzAN2gXDefF+XWKPlRmchMLEHoAN56gKHkU7vn6nxlf95zeaim6w1VKvwAxxgNYz/MdyWMp0j1iFH8NpIfdGuwzQTvhyO5Qw5SX1f6XORfI7CaAgATNexc3BSwxzvbc1 ogupte@olivers-mbp.lan\njalvz:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDAWpicqRkdTMLxd+MPV31EFZgvwfJCky9wnP8BktvSR+vYy6lY5f8LZBo3HRrjpCk4/N/nMKg/J6OnvuJW5SiwYHp2OlWX141sjxlECMPXMrSZGO5kYuZVoP8zrPcz69/8bWBc0RhZLZKP0iODndIEYxjYZkV/tJILgllSXC3qtVD1J5iOhtTWIYn9vCMM4UU3S9VFyjUtQvh+M5Ic0COh6cBdtf4FYrXkH/Unxd/IutbPGxRVu5MMO8SRK2cvNTIfRcM7nKHsy29dCF/VYWzs0xgJt1gT9S1aoiF/ops/4k1emBhL8L1owhF/XTEFIIzJNE8Iw3ImVRLZpeeAsdCj jalvz@hey-1\njuan_alvarez:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDWFXs5WwDt9Ho7mBgoGar+CRFAMmF06WPCLy4ExaMKa285DmW97YzfBFXFGl26lcMzFyajXNrgTrgGYSajRwSsBeJcJrEHWYSR6NF7cigkxlxxGf7lLuLukmDFDi8LGnZNPYT7ETOld8v+7MFvpyaflHhgCTfPJNi3wOxDoloFQnf+DL3IpxMS2vUViq4HK+LkV9i4AZokPBbZ3rnf7kFvRzcCURt3IWE/2SgC4RyoKTAQZRv9j+L8C41O4mq4HVZAUEkJl0pTpmGtqoqGvjCuQsb1j7aAjjQ4PhYFu4U67/7Xyj+tA/AbQo7DqL7PN7ZdXFpembkPM7BjIq+uAm7f juan_alvarez@cs-6000-devshell-vm-8605ad36-fb9e-486d-9727-2f1562244ecb\njuan:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKm2vLZ5KP4duakrOH/hklCjo6XrJf+CiEUtgF6fsymhQZ+L3wHXDH2AxFD9Spprp2QahM4vDxTe8Mh4CYKXlrYBAWtJ3lpWJVCqdy7uDbBajauAFa1p2yO/Q0fxZ33XKWp+sJOSzGy3+GfLOeU/J57wg7rYObUuRfHZ5vAe/HwwC7AhDh5Rc0GXAIgLOprWe8bIjy4MHNqMKSHw/dith3o90CLeVyE9az15+c5O8Z4EMRthbxO1/74goUFa/sTT1/vhSmRK3KKUqLz+PWrPQg38Z1hGprrSUaC/S631PsM4t5AcDglWzww8yDDMTCAM3a66E42EuVwjgtOYHTRfaf juan@x1\nbeni:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC8vCFFivubPYhOxtig3hCwWGkndADdlfnwpoyA2VQLhGKCPQwgfjmy4NbzzuM1OC/7gmzXpyK+CrgGVO0i6cFEuZLWX+cCBeqOG9DDNzLSae8y3DJur5Z/Z0z8CxMh5nwH60hPwuWGLG47mlKueWjePpoCj3tjT/5rNvM2FlpqHiJLdo3/WPfU5d1dW885Cm+K/rMwPxXEr/yCagCHZXhXUDO5TDknA0dUJx2wRI4pJ9USOX9T3xkFyWoAK7Nep0WM+CH+rF9RlajC71GpgoJjNNN9JppNCIt3rULoNaKUP6F8q44WviklGDmRUuVgmDS2sfeNcNJtBw06XzzAVU9p beni@X1\nvigneshh:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDe2DQPExGpiF+7LWT6GRGf5YuPnweqLXkczuuc68IjBqLL6UUKSCO7nRdPgHf0rRchktyQrJTjYJ6gYxOFaNnrIyCdQ4fdjD/aENvn3SWXzPy9oCAwt2g2UorJtt6n7DvYVi3G68+uJvo1Bv0ws4tKdXCpQkLGd1cT2JKoZLGJNkLXFnSyIXzMS0ogfLCwSeqoSnv32JKKz6zNP8hTiIXoBOY8bra7v3ln++fbb2GetxVgbihbptIIUEqbnOYmN4MLfnB0MxusTcO9UjHvN2RGzHGWvHA+q7Zmo2XdMf/mjGJKHwQGvgKsTfJ1ai/Zj3iaPuL80o+Ub5IbjXV3YZdV vigneshh\nandrew:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDBefA+CAyyC9FE9LUp0XJ8p4lqH0EimaGWGVROJSDuL9gc+KBI78fTp7xnHWtoHm91WLAjcQDgSe41h2SKJwVw9ORtGOuwzAe/A002R+6yci9y7ofXpmoKITRiXmCDJmMW0P0rza0PezwCXpanQzZStFhInLdMN+tGrWQmNNioCp4/rGX8JUaQxSXVhx1hfn2vS2xStGV8SXrNb/B/gv1LZ0r18seaPazCzakNagiRPrGSvAUgNkeCXOkO80Pvj7m/oyv5pZgADcly2cnZ3dxOMrE89bwe83gVfb2XE0Cxvu7SstauHTVCAV8HplJ5Anf2TbGxdcuhuRmcENJMmtJT andrew@alloy\nroot:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDdbqLQuHtDJ2Ss7QWxL35Y59D221PRSShPTjM0IVK69hZZBfCHxV1Rw3EjbvpsG7q3JqZa9LS0KKwqtiyhSW2fcqv+pQyiFxVMdr1AlMbm3yzQ7E6tP+iFmhxJ/T8fgLA61Idxbomb4KM411izEkSWjCaNsS/wXrZWCEc51umt7jG4fgO8eeVn6+W4/6GPOsPdvbBQdaZ+IeYb+emYpk8vawuh06UWn3LKT/AGrEcCYd5Myqa4sMPWofaOp2edV+xPq/L0um246PNJD+SOuG5ckLGZ/d6NOruI5VcOflg7YSYP5hNAODMcZGAwVL3cmmKbDnGsUs4mn+16OaU8TR4z root@1e73a4ea8e4a\nroot:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKzX+ZZBJXvK4xzHoHavFTqf0m+nDYMxf1uY1auIqK/o+HFs8xCxpP05D3DeV9vzqbK0kmfsyMoYhpB4CWNz2dimtt+nujn01Vs9KjJOF+KZOk7YOoP/tXypJZgGdaBeZn5XSccQUvLohMVIu2IJVmS/Vt8b9pzxcu1GQ273yShzSZoKi6IEM4y1eu8p105Qv6zMrBtoWhN2nJFPrwIy6F4T1B08+jmY7Las2yUJ1OjaNKtNMZnpDrLwH6UXDhvZPwtu8PhMM31wP3ewGJk57SKhzsZqDo3rIRxtC1LF0KCoR0aShE/Sd8sXdMcHfdZnsc9YZwAyzc3GcN/Ap5eXGn gil@six\napm:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCtLIKUPVI7VpJx3rFlfqHSlXo6PXYAJ5+nrNUyToF+VyBnsl4IGx+XpP3ipJwxSRjsl/jxmtGK8By/KO7M/edXXCoJ5HcR8ApFp+opCy/eyun37e3ruaNVG54K1vyS1vfjHAAEevx3K/Ki70CErtELDu/KHwi1bHqYMlPiVBjF6Wje5JvDD1INb5dNmDVfdFzPDnsj3SF5DG4Iw0SEiyQMaoGxYiWogE+5Xu7hgu98JIepd0/H5CK8X5tQUpa1Wet19KaVqfKGJ2BmJpoxdwWDe4RK+zjmETHpuvtXHfNz1wqwwPbIKAFsSQZI8tSmyntTwZirzl+fnHptSd7Fjd7P simitt@silmac.local\nandrew:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCmUfggVU+ngEtl+BjvCS/E9Q3CRkZHu/IjEfArZwHj5aPTGTr5e2uNrcguWb6tWAt/NMjqbP3QG+tng7VGJtjKS/sQENbFvb3rrK4ppoap53XnCApDVdFqyvEzEX9rBe5D4ZNZs73Ti0nvL+AlnJairC618HKWrWnPGKPcAuRPw3lmNzpsYYaLf9rRs+/+VOq5OTz8lE85E1dNgQP/DYC95G/QoYCrkORSe/k45mrAOgxGNUKmyAToJDf3ZSwrocwtd9Cl+i/77R87mp8oFvnYfqEDXtyh6/lJMUXv8EE+/Wma+m1yJ1DDt3DnBzL2/yaVqZBMX54F362U3HoCvPbe7Rx7vIY0BLRGVbTgbSvjV80bxnyT9PRh09c81n3DU3sufBb3zMhGM2b52YNn9QcldAUDKIQJ8I5DXa9VaFInObUueK4YGh1j00k0GjEh0xmyKXcdRYhK8C3lQkBS5n70zj3rdobyDT5mSE3gpC+drgzdJByMpwg75WiQg92v6+U= andrew@goat\n',
            sshKeys: 'soren_louv:ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBJb6s9CH7r6ehJzbX57OiyBJDkKUcog1KxqcpY+d/G4N1Wfcrjh0RsIRiCd//gSkbW0GKlqTGN9ZJ9kdbABYE24= google-ssh {"userName":"soren.louv@elastic.co","expireOn":"2019-03-12T19:14:08+0000"}\nsoren_louv:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAFKSKqDqk27beDKAbpsQxbIkvxO+yowzOClMq6XS+eLv43TQgcYInpPBpOzcHjhKjsvgqg91qj+15NUxLupKAD2oBbugraYpOmUkZ6cxc/rZ/NFCTvhg9SWlk0xB4FEJ9o9lMiBbUJqTEf7IipZ7tFShkVP6EGGbp3c7UppSnFsvxnQEG7/GQ/ugbPm1+wl5WzUDbDApgjAUsOp8xJLdkomomBY/Zglqo2DK/fILS8AjmQxWVT2trk1m/umWw1Lxx7cj5OHyXU9buUUcRpdNavF73dtkYtWZ/pzjMYA4cXlTmNqxEjq4tSeKSvxPZnYwqww2or+waRDeg2UARRxvYkk= google-ssh {"userName":"soren.louv@elastic.co","expireOn":"2019-03-12T19:14:07+0000"}\n\ngke-de35da3502652f31f7a5:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCv3K3pcILPNefb/dfxj5sYI8zn7dxChGLWQskH1eZLYULWOXoPnbD6wzBelh3CRAdvFFflv/4jA3Df+8pdfSTEH1yo+RmNhtDoAtnQhAoQsxAn8vcvcHamS20qpbgfmUc/SwJVjJgj2HS1dSqQPvA/5WKLCK0dNhowXlNtb2ISj8kw+Pv2MtFxkxVEzqLE3TGwgIoeNYq8Vwrsio/VVybBxc+pn9pblE8YhSrsEPJMNsA88Ydafvnw3VBvlk8BlKr1LjyNHv+u9vLucRNDZRALcmHRU8LZPqA7QPV51fEC6RvGincTcnbNM0WY1noh2eRg+RyKwU+cV0OvU44b2K0N gke-de35da3502652f31f7a5@gke-de35da3502652f31f7a5'
          },
          numericProjectId: 513326162531,
          projectId: 'elastic-apm'
        }
      }
    }
  ],
  azure: [
    {
      name: 'default azure fixture',
      response: {
        compute: {
          azEnvironment: 'AZUREPUBLICCLOUD',
          isHostCompatibilityLayerVm: 'true',
          licenseType: 'Windows_Client',
          location: 'westus',
          name: 'examplevmname',
          offer: 'Windows',
          osProfile: {
            adminUsername: 'admin',
            computerName: 'examplevmname',
            disablePasswordAuthentication: 'true'
          },
          osType: 'linux',
          placementGroupId: 'f67c14ab-e92c-408c-ae2d-da15866ec79a',
          plan: {
            name: 'planName',
            product: 'planProduct',
            publisher: 'planPublisher'
          },
          platformFaultDomain: '36',
          platformUpdateDomain: '42',
          publicKeys: [{
            keyData: 'ssh-rsa 0',
            path: '/home/user/.ssh/authorized_keys0'
          },
          {
            keyData: 'ssh-rsa 1',
            path: '/home/user/.ssh/authorized_keys1'
          }
          ],
          publisher: 'RDFE-Test-Microsoft-Windows-Server-Group',
          resourceGroupName: 'macikgo-test-may-23',
          resourceId: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname',
          securityProfile: {
            secureBootEnabled: 'true',
            virtualTpmEnabled: 'false'
          },
          sku: 'Windows-Server-2012-R2-Datacenter',
          storageProfile: {
            dataDisks: [{
              caching: 'None',
              createOption: 'Empty',
              diskSizeGB: '1024',
              image: {
                uri: ''
              },
              lun: '0',
              managedDisk: {
                id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampledatadiskname',
                storageAccountType: 'Standard_LRS'
              },
              name: 'exampledatadiskname',
              vhd: {
                uri: ''
              },
              writeAcceleratorEnabled: 'false'
            }],
            imageReference: {
              id: '',
              offer: 'UbuntuServer',
              publisher: 'Canonical',
              sku: '16.04.0-LTS',
              version: 'latest'
            },
            osDisk: {
              caching: 'ReadWrite',
              createOption: 'FromImage',
              diskSizeGB: '30',
              diffDiskSettings: {
                option: 'Local'
              },
              encryptionSettings: {
                enabled: 'false'
              },
              image: {
                uri: ''
              },
              managedDisk: {
                id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampleosdiskname',
                storageAccountType: 'Standard_LRS'
              },
              name: 'exampleosdiskname',
              osType: 'Linux',
              vhd: {
                uri: ''
              },
              writeAcceleratorEnabled: 'false'
            }
          },
          subscriptionId: 'xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
          tags: 'baz:bash;foo:bar',
          version: '15.05.22',
          vmId: '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
          vmScaleSetName: 'crpteste9vflji9',
          vmSize: 'Standard_A3',
          zone: ''
        },
        network: {
          interface: [{
            ipv4: {
              ipAddress: [{
                privateIpAddress: '10.144.133.132',
                publicIpAddress: ''
              }],
              subnet: [{
                address: '10.144.133.128',
                prefix: '26'
              }]
            },
            ipv6: {
              ipAddress: [
              ]
            },
            macAddress: '0011AAFFBB22'
          }]
        }
      }
    }
  ]
}
