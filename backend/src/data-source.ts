import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dbOptions } from './entities';

export default new DataSource(dbOptions(process.env));
