import { Adapter, BroadcastOptions } from 'socket.io-adapter';
import amqp from 'amqplib';

type Opts = {
  queueName?: string,
  channelSeperator?: string,
  prefix?: string,
  useInputExchange?: boolean,
  amqpConnectionOptions?: {},
  logger?: (msg: string) => void
}

type AMQPConnectionOptions = string | {
 hostname: string;
 port: number;
 username: string;
 password: string;
 frameMax?: number;
 heartbeat?: number;
}

export const amqpAdapter = (amqpConnectionOptions: AMQPConnectionOptions, options: Opts, initialCb?: () => void) => {
  /* if (!options.queueName) {
    throw new Error('"queueName" is required');
  } */

  const opts = {
    queueName: '',
    channelSeperator: '#',
    prefix: '',
    useInputExchange: false,
    logger: (msg: string) => {},
    ...options,
  };
  const amqpExchangeOptions = {
    durable: true,
    internal: false,
    autoDelete: false
  };
  const incomingMessagesQueue = {
    exclusive: true,
    durable: false,
    autoDelete: true
};

  class AMQPAdapter extends Adapter {
    amqpExchangeName: string;
    amqpInputExchangeName: string;
    publishExchange: string;
    connection: amqp.Connection;
    channel: amqp.Channel;
    amqpConsumerID: string;
    globalRoomName: string;

    constructor(nsp: string) {
      super(nsp);
      this.amqpExchangeName = opts.prefix + '-socket.io';
      this.amqpInputExchangeName = opts.prefix + '-socket.io-input';
      this.publishExchange = opts.useInputExchange ? this.amqpInputExchangeName : this.amqpExchangeName;
      this.init()
    }

    async init() {
      this.connection = await amqp.connect(amqpConnectionOptions);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.amqpExchangeName, 'direct', amqpExchangeOptions);
      await this.channel.assertExchange(this.amqpInputExchangeName, 'fanout', amqpExchangeOptions);
      await this.channel.bindExchange(this.amqpExchangeName, this.amqpInputExchangeName, '');
      const amqpIncomingQueue = await this.channel.assertQueue(opts.queueName, incomingMessagesQueue);
      this.globalRoomName = this.getChannelName(opts.prefix, this.nsp.name);
      await this.channel.bindQueue(amqpIncomingQueue.queue, this.amqpExchangeName, this.globalRoomName);
      const ok = await this.channel.consume(amqpIncomingQueue.queue, (msg: any) => {
        opts.logger('');
        const content = JSON.parse(msg.content.toString());
        const type = content.messageType[0];
        this.onmessage(content);
      }, {
        noAck: true
      });
      if (initialCb) {
        await initialCb();
      }
      this.amqpConsumerID = ok.consumerTag;
    }

    onmessage(content: any) {
      this.broadcast(content, { rooms: this.rooms } as unknown as BroadcastOptions);
    }

    async broadcast(packet: any, opts: BroadcastOptions) {
      super.broadcast.call(this, packet, opts);
      if (opts.rooms && opts.rooms.size) {

      } else {
        await this.channel.publish(
          this.publishExchange,
          this.globalRoomName,
          Buffer.from(
            JSON.stringify(packet)
          )
        )
      }
    }

    async closeConnection() {
      await this.connection.close();
    }

    getChannelName(...args: string[]) {
      return args.join(opts.channelSeperator) + opts.channelSeperator;
    }
  }
  return AMQPAdapter;
}