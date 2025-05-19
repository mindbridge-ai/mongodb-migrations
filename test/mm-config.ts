import { assign } from 'lodash';
import { config } from './common';

export default assign({}, config, {
  directory: "created-migrations"
});