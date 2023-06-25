import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { YeelightBulbHomebridgePlatform } from './platform';
import * as net from 'net';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class YeelightBulbPlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  constructor(
    private readonly platform: YeelightBulbHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Yeelight')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.model);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    this.platform.log.info('Setting Yeelight Bulb to ' + value ? 'on' : 'off');
    // implement your own code to turn your device on/off
    const ip = this.accessory.context.device.location.split('//')[1].split(':')[0];
    const port = this.accessory.context.device.location.split('//')[1].split(':')[1];
    const payload = `{"id":1,"method":"set_power","params":["${value ? 'on' : 'off'}","smooth",500]}\r\n`;
    const client = new net.Socket();
    client.connect(port, ip, () => {
      this.platform.log.info('Connected to Yeelight Bulb, sending payload: ' + payload);
      client.write(payload);
    });
    client.on('data', (data) => {
      this.platform.log.info('Set status - Received: ' + data);
      client.destroy(); // kill client after server's response
    });
    client.on('close', () => {
      this.platform.log.info('Set status - connection closed');
    });
    setTimeout(() => {
      if (!client.destroyed) {
        client.destroy();
      }
    }, 5000);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    //split ip, port from accessory.context.device.location yeelight://192.168.50.219:55443
    const ip = this.accessory.context.device.location.split('//')[1].split(':')[0];
    const port = this.accessory.context.device.location.split('//')[1].split(':')[1];
    const payload = '{"id":1,"method":"get_prop","params":["power"]}\x0D\x0A';
    //send tcp request to yeelight
    try {
      const isOn = await new Promise<boolean>((resolve, reject) => {
        let isOn = false;
        const client = new net.Socket();
        client.connect(port, ip, () => {
          this.platform.log.info('Connected to Yeelight Bulb, sending payload: ' + payload);
          client.write(payload);
        });
        //get response from yeelight
        client.on('data', (data) => {
          this.platform.log.info('Check Status - Received: ' + data);
          const response = JSON.parse(data.toString());
          if (response.result) {
            isOn = response.result[0] === 'on';
          }
          resolve(isOn);
          this.platform.log.info('Yeelight Bulb is ' + isOn ? 'on' : 'off');
          client.destroy(); // kill client after server's response
        });
        client.on('close', () => {
          this.platform.log.info('Check status - connection closed');
        });
        //wait for response
        setTimeout(() => {
          if (!client.destroyed) {
            client.destroy();
          }
          resolve(isOn);
        }, 5000);
      });
      return isOn;
    } catch (error) {
      this.platform.log.error('Error getting Yeelight Bulb state: ' + error);
    }

    return false;
  }


}
