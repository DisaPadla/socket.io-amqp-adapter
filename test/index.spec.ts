import { createServer } from 'http';
import io from 'socket.io';
import ioc from 'socket.io-client';

import { amqpAdapter } from '..';

const RABBIT_MQ_URI = process.env.RABBIT_MQ_URI || 'amqp://localhost';

describe('socket.io-amqp-adapter', () => {
  const sios: io.Server[] = [];
  function create(nsp: any, fn?: any) {
    const srv = createServer();
    const sio = new io.Server(srv);
    sios.push(sio);
    sio.adapter(amqpAdapter(RABBIT_MQ_URI, {prefix: 'unit-tests', useInputExchange: true}, function () {
        srv.listen(function (err: any) {
            if (err) {
                throw err;
            } // abort tests
            if ('function' == typeof nsp) {
                fn = nsp;
                nsp = '';
            }
            nsp = nsp || '/';
            const addr = srv.address();
            const url = 'http://localhost:' + (addr as any).port + nsp;
            fn(sio.of(nsp), ioc(url));
        });
    }));
  }

  afterEach(function () {
      sios.forEach((sio) => {
          sio.close(() => {
              console.log(111111, (sio as any)?.nsps)
              for (const key in (sio as any).nsps) {
                  setTimeout((sio as any).nsps[key].adapter.closeConnection, 1000);
              }
          });
      });
  });

  test('broadcasts', function (done) {
        create(function (server1: any, client1: any) {
            create(function (server2: any, client2: any) {
                client1.on('woot', function (a: any, b: any) {
                    expect(a).toEqual([]);
                    expect(b).toEqual({a: 'b'});
                    done();
                });
                server2.on('connection', function (c2: any) {
                    c2.broadcast.emit('woot', [], {a: 'b'});
                });
            });
        });
    });
})

