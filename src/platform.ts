import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { YeelightBulbPlatformAccessory } from './platformAccessory';
import * as dgram from 'dgram';


/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class YeelightBulbHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    let payload = 'M-SEARCH * HTTP/1.1\x0d\x0a';
    payload += 'HOST: 239.255.255.250:1982\x0d\x0a';
    payload += 'MAN: "ssdp:discover"\x0d\x0a';
    payload += 'ST: wifi_bulb\x0d\x0a';
    //add 0d 0a to the end of the payload
    const multicastAddress = '239.255.255.250';
    const multicastPort = 1982;
    const socket = dgram.createSocket('udp4');
    socket.on('listening', () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(128);
      socket.addMembership(multicastAddress);
      socket.send(payload, multicastPort, multicastAddress, (error, bytes) => {
        if (error) {
          this.log.error('Error sending message:', error);
        } else {
          this.log.info(`Sent ${bytes} bytes to ${multicastAddress}:${multicastPort}`);
        }
      });
    });

    function parseScript(script: string): Record<string, string> {
      const lines = script.split('\n');
      const data: Record<string, string> = {};

      for (const line of lines) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex !== -1) {
          const key = line.slice(0, separatorIndex).trim().toLowerCase();
          const value = line.slice(separatorIndex + 1).trim();
          data[key] = value;
        }
      }

      return data;
    }

    // Collection of devices of type Record<string, string>
    const devices: Record<string, string>[] = [];
    socket.on('message', (message, rinfo) => {
      this.log.info(`Received ${message.length} bytes from ${rinfo.address}:${rinfo.port}`);
      const parsedDevice = parseScript(message.toString());
      devices.push(parsedDevice);
    });

    // Handle errors
    socket.on('error', (error) => {
      this.log.error('Socket error:', error);
      socket.close();
    });

    // Handle socket close event
    socket.on('close', () => {
      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
        this.log.info('Discovered device:', device.id);

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(device.id);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new YeelightBulbPlatformAccessory(this, existingAccessory);

          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.id);

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.model, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new YeelightBulbPlatformAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    });

    // Bind the socket to a specific port
    socket.bind(62142);

    this.log.info('Discovering devices...');

    setTimeout(() => {
      socket.close();
    }, 1000);
  }
}
