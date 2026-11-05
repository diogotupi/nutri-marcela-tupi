import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {createFreeMealHandler} from './handler.mjs';

Deno.serve(createFreeMealHandler({createClient,getEnv:(name:string)=>Deno.env.get(name)}));
