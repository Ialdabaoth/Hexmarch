import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { watchForNewVersion } from './lib/update';

watchForNewVersion();

export default mount(App, { target: document.getElementById('app')! });
