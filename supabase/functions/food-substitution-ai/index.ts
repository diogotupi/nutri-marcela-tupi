import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {createHandler} from './handler.mjs';
Deno.serve(createHandler({createClient,getEnv:(name:string)=>Deno.env.get(name)}));
