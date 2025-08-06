--
-- Complex functions with various dollar quoting scenarios
--

CREATE FUNCTION public.complex_function(input_text text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result text;
BEGIN
    -- Simple dollar quote
    result := $s$Hello $s$ || input_text;
    
    -- Nested function call
    EXECUTE format('SELECT %L', result) INTO result;

    /*
    embedded block quote
    including a semi-colon; 
    */
    
    RETURN result;
END;
$$;

CREATE FUNCTION public.nested_dollar_quotes(data jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $function$
DECLARE
    query text;
    inner_func text;
BEGIN
    inner_func := $inner$
        CREATE FUNCTION temp_func() RETURNS text AS $body$
        BEGIN
            RETURN 'nested content';
        END;
        $body$ LANGUAGE plpgsql;
    $inner$;
    
    EXECUTE inner_func;
    
    query := format($fmt$
        SELECT json_extract_path_text(%L::json, 'key')
    $fmt$, data::text);
    
    RETURN query;
END;
$function$;

CREATE PROCEDURE public.maintenance_procedure(table_name text)
    LANGUAGE plpgsql
    AS $proc$
BEGIN
    EXECUTE format('ANALYZE %I', table_name);
    RAISE NOTICE 'Analyzed table: %', table_name;
END;
$proc$;
