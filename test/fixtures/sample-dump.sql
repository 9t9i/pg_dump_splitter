--
-- PostgreSQL database dump
--

-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';

--
-- Name: join_array(string); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_string(items text[]) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $BODY$
BEGIN
    SELECT array_to_string(items, ';', '');
END;
$BODY$;

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);

--
-- Name: active_users; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_users AS
 SELECT users.id,
    users.username,
    users.email,
    ';;;;' AS placeholder
   FROM public.users
  WHERE (users.created_at > (now() - '30 days'::interval));

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);

--
-- PostgreSQL database dump complete
--
