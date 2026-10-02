import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const serviceSupa = createClient(supabaseUrl, serviceKey);

async function applyUpdate() {
  console.log('Testing column additions or schema compatibility...');
  // Check if we can select or if we need SQL query
  const { data: textSample } = await serviceSupa.from('texts').select('*').limit(1);
  console.log('Text sample keys:', textSample ? Object.keys(textSample[0]) : []);

  const { data: vocabSample } = await serviceSupa.from('vocabulary').select('*').limit(1);
  console.log('Vocab sample keys:', vocabSample ? Object.keys(vocabSample[0]) : []);
}

applyUpdate();
