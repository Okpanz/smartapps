import { AppRegistry } from 'react-native';
import 'web-streams-polyfill/polyfill';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
