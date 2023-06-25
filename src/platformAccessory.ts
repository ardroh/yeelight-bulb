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

    // // register handlers for the Brightness Characteristic
    // this.service.getCharacteristic(this.platform.Characteristic.Brightness)
    //   .onSet(this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    //   let motionDetected = false;
    //   setInterval(() => {
    //     // EXAMPLE - inverse the trigger
    //     motionDetected = !motionDetected;

    //     // push the new value to HomeKit
    //     motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //     motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

  //     this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
  //     this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
  //   }, 10000);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    this.platform.log.info('Set Characteristic On ->', value);
    // implement your own code to turn your device on/off
    const ip = this.accessory.context.device.location.split('//')[1].split(':')[0];
    const port = this.accessory.context.device.location.split('//')[1].split(':')[1];
    const payload = `{"id":1,"method":"set_power","params":["${value ? 'on' : 'off'}","smooth",500]}\r\n`;
    const client = new net.Socket();
    client.connect(port, ip, () => {
      this.platform.log.debug('Connected to Yeelight Bulb');
      client.write(payload);
    });
    client.on('data', (data) => {
      this.platform.log.debug('Received: ' + data);
      client.destroy(); // kill client after server's response
    });
    client.on('close', () => {
      this.platform.log.debug('Connection closed');
    });
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
    const client = new net.Socket();
    let isOn = false;
    client.connect(port, ip, () => {
      client.write(payload);
    });
    //get response from yeelight
    client.on('data', (data) => {
      this.platform.log.debug('Received: ' + data);
      const response = JSON.parse(data.toString());
      if (response.result) {
        isOn = response.result[0] === 'on';
      }
    });
    //wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));

    client.destroy(); // kill client after server's response


    return isOn;
  }

}
