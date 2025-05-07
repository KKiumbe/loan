--
-- PostgreSQL database dump
--

-- Dumped from database version 16.6 (Postgres.app)
-- Dumped by pg_dump version 16.6 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- Name: CustomerStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."CustomerStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public."CustomerStatus" OWNER TO postgres;

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'UNPAID',
    'PAID',
    'PPAID',
    'CANCELLED'
);


ALTER TYPE public."InvoiceStatus" OWNER TO postgres;

--
-- Name: ModeOfPayment; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ModeOfPayment" AS ENUM (
    'CASH',
    'MPESA',
    'BANK_TRANSFER',
    'CREDIT_CARD',
    'DEBIT_CARD'
);


ALTER TYPE public."ModeOfPayment" OWNER TO postgres;

--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELED'
);


ALTER TYPE public."TaskStatus" OWNER TO postgres;

--
-- Name: TaskType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."TaskType" AS ENUM (
    'BAG_ISSUANCE',
    'PAYMENT_COLLECTION',
    'CUSTOMER_FEEDBACK',
    'OTHER'
);


ALTER TYPE public."TaskType" OWNER TO postgres;

--
-- Name: TenantStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."TenantStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."TenantStatus" OWNER TO postgres;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."UserStatus" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "userId" integer NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    details jsonb,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO postgres;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    email text,
    "phoneNumber" text NOT NULL,
    "secondaryPhoneNumber" text,
    gender text,
    county text,
    town text,
    location text,
    "estateName" text,
    building text,
    "houseNumber" text,
    category text,
    "monthlyCharge" double precision NOT NULL,
    status public."CustomerStatus" DEFAULT 'ACTIVE'::public."CustomerStatus" NOT NULL,
    "garbageCollectionDay" text NOT NULL,
    collected boolean DEFAULT false NOT NULL,
    "closingBalance" double precision NOT NULL,
    "trashBagsIssued" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Customer" OWNER TO postgres;

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "customerId" text NOT NULL,
    "invoicePeriod" timestamp(3) without time zone NOT NULL,
    "invoiceNumber" text NOT NULL,
    "invoiceAmount" double precision NOT NULL,
    "closingBalance" double precision NOT NULL,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "isSystemGenerated" boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "amountPaid" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public."Invoice" OWNER TO postgres;

--
-- Name: InvoiceItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InvoiceItem" (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    description text NOT NULL,
    amount double precision NOT NULL,
    quantity integer NOT NULL
);


ALTER TABLE public."InvoiceItem" OWNER TO postgres;

--
-- Name: MPESAConfig; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MPESAConfig" (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "shortCode" text NOT NULL,
    name text NOT NULL,
    "apiKey" text NOT NULL,
    "passKey" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MPESAConfig" OWNER TO postgres;

--
-- Name: MPESAConfig_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."MPESAConfig_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."MPESAConfig_id_seq" OWNER TO postgres;

--
-- Name: MPESAConfig_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."MPESAConfig_id_seq" OWNED BY public."MPESAConfig".id;


--
-- Name: MPESATransactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MPESATransactions" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "TransID" text NOT NULL,
    "TransTime" timestamp(3) without time zone NOT NULL,
    "ShortCode" text NOT NULL,
    "TransAmount" double precision NOT NULL,
    "BillRefNumber" text NOT NULL,
    "MSISDN" text NOT NULL,
    "FirstName" text NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MPESATransactions" OWNER TO postgres;

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "userId" integer NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Notification" OWNER TO postgres;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    amount double precision NOT NULL,
    "modeOfPayment" public."ModeOfPayment" NOT NULL,
    "firstName" text,
    receipted boolean DEFAULT false NOT NULL,
    "transactionId" text NOT NULL,
    ref text,
    "receiptId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Payment" OWNER TO postgres;

--
-- Name: Receipt; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Receipt" (
    id text NOT NULL,
    "tenantId" integer NOT NULL,
    "receiptNumber" text NOT NULL,
    amount double precision NOT NULL,
    "modeOfPayment" public."ModeOfPayment" NOT NULL,
    "paidBy" text,
    "transactionCode" text,
    "phoneNumber" text,
    "paymentId" text NOT NULL,
    "customerId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Receipt" OWNER TO postgres;

--
-- Name: ReceiptInvoice; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ReceiptInvoice" (
    id text NOT NULL,
    "receiptId" text NOT NULL,
    "invoiceId" text NOT NULL
);


ALTER TABLE public."ReceiptInvoice" OWNER TO postgres;

--
-- Name: SMS; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SMS" (
    id text NOT NULL,
    clientsmsid text NOT NULL,
    mobile text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SMS" OWNER TO postgres;

--
-- Name: SMSConfig; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SMSConfig" (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "partnerId" text NOT NULL,
    "apiKey" text NOT NULL,
    "shortCode" text NOT NULL,
    "customerSupportPhoneNumber" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SMSConfig" OWNER TO postgres;

--
-- Name: SMSConfig_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."SMSConfig_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."SMSConfig_id_seq" OWNER TO postgres;

--
-- Name: SMSConfig_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."SMSConfig_id_seq" OWNED BY public."SMSConfig".id;


--
-- Name: Task; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Task" (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "createdBy" integer NOT NULL,
    type public."TaskType" NOT NULL,
    status public."TaskStatus" DEFAULT 'PENDING'::public."TaskStatus" NOT NULL,
    "declaredBags" integer,
    "assignedAt" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Task" OWNER TO postgres;

--
-- Name: TaskAssignee; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TaskAssignee" (
    id integer NOT NULL,
    "taskId" integer NOT NULL,
    "assigneeId" integer NOT NULL,
    "assignedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TaskAssignee" OWNER TO postgres;

--
-- Name: TaskAssignee_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."TaskAssignee_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."TaskAssignee_id_seq" OWNER TO postgres;

--
-- Name: TaskAssignee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."TaskAssignee_id_seq" OWNED BY public."TaskAssignee".id;


--
-- Name: Task_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Task_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Task_id_seq" OWNER TO postgres;

--
-- Name: Task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Task_id_seq" OWNED BY public."Task".id;


--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Tenant" (
    id integer NOT NULL,
    name text NOT NULL,
    "createdBy" text NOT NULL,
    status public."TenantStatus" DEFAULT 'ACTIVE'::public."TenantStatus" NOT NULL,
    "subscriptionPlan" text NOT NULL,
    "monthlyCharge" double precision NOT NULL,
    "numberOfBags" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Tenant" OWNER TO postgres;

--
-- Name: Tenant_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Tenant_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Tenant_id_seq" OWNER TO postgres;

--
-- Name: Tenant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Tenant_id_seq" OWNED BY public."Tenant".id;


--
-- Name: TrashBagIssuance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TrashBagIssuance" (
    id text NOT NULL,
    "taskId" integer NOT NULL,
    "customerId" text NOT NULL,
    "tenantId" integer NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "bagsIssued" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."TrashBagIssuance" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    email text NOT NULL,
    "phoneNumber" text NOT NULL,
    gender text,
    county text,
    town text,
    password text NOT NULL,
    role text[],
    "customPermissions" jsonb,
    "createdBy" integer,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "mfaEnabled" boolean DEFAULT false NOT NULL,
    "bagsHeld" integer,
    "originalBagsIssued" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: UserActivity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UserActivity" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    action text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserActivity" OWNER TO postgres;

--
-- Name: UserActivity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."UserActivity_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."UserActivity_id_seq" OWNER TO postgres;

--
-- Name: UserActivity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."UserActivity_id_seq" OWNED BY public."UserActivity".id;


--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_id_seq" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: _CreatedUsers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."_CreatedUsers" (
    "A" integer NOT NULL,
    "B" integer NOT NULL
);


ALTER TABLE public."_CreatedUsers" OWNER TO postgres;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: MPESAConfig id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESAConfig" ALTER COLUMN id SET DEFAULT nextval('public."MPESAConfig_id_seq"'::regclass);


--
-- Name: SMSConfig id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SMSConfig" ALTER COLUMN id SET DEFAULT nextval('public."SMSConfig_id_seq"'::regclass);


--
-- Name: Task id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Task" ALTER COLUMN id SET DEFAULT nextval('public."Task_id_seq"'::regclass);


--
-- Name: TaskAssignee id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TaskAssignee" ALTER COLUMN id SET DEFAULT nextval('public."TaskAssignee_id_seq"'::regclass);


--
-- Name: Tenant id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tenant" ALTER COLUMN id SET DEFAULT nextval('public."Tenant_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Name: UserActivity id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserActivity" ALTER COLUMN id SET DEFAULT nextval('public."UserActivity_id_seq"'::regclass);


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLog" (id, "tenantId", "userId", action, resource, details, description, "createdAt") FROM stdin;
ed7aa327-54e7-4666-b0c3-595b169161c2	1	1	UPDATE_TENANT	TENANT	{"updatedFields": ["name", "subscriptionPlan", "monthlyCharge", "numberOfBags"]}	Updated tenant details for tenant ID 1	2025-01-13 14:32:15.386
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Customer" (id, "tenantId", "firstName", "lastName", email, "phoneNumber", "secondaryPhoneNumber", gender, county, town, location, "estateName", building, "houseNumber", category, "monthlyCharge", status, "garbageCollectionDay", collected, "closingBalance", "trashBagsIssued", "createdAt", "updatedAt") FROM stdin;
c7c8261d-a0ff-4696-93d2-ee617c90cb05	1	james	martin	kevoqmbe@gmail.com	0702550191	\N	Female	Nairobi	Kasarani	-1.23245,36.90057	Green Gardens	Block C	45B	Residential	500	ACTIVE	MONDAY	f	0	f	2025-01-13 13:54:20.664	2025-01-13 13:54:20.664
8e33e527-f112-4692-a97e-5b9694912d26	1	kevin	martin	kevoqmbe@gmail.com	0702550190	\N	Female	Nairobi	Kasarani	-1.23245,36.90057	Green Gardens	Block C	45B	Residential	500	ACTIVE	MONDAY	f	0	f	2025-01-13 13:54:32.472	2025-01-13 13:54:32.472
e2ea0f31-3cc0-4ab8-aeab-3b7b4d0dd142	1	peter	wendo	kevoqmbe@gmail.com	0722230603	\N	Female	Nairobi	Kasarani	-1.23245,36.90057	Green Gardens	Block C	45B	Residential	500	ACTIVE	MONDAY	f	0	f	2025-01-13 13:54:45.196	2025-01-13 13:54:45.196
\.


--
-- Data for Name: Invoice; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Invoice" (id, "tenantId", "customerId", "invoicePeriod", "invoiceNumber", "invoiceAmount", "closingBalance", status, "isSystemGenerated", "createdAt", "amountPaid") FROM stdin;
\.


--
-- Data for Name: InvoiceItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InvoiceItem" (id, "invoiceId", description, amount, quantity) FROM stdin;
\.


--
-- Data for Name: MPESAConfig; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MPESAConfig" (id, "tenantId", "shortCode", name, "apiKey", "passKey", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: MPESATransactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MPESATransactions" (id, "tenantId", "TransID", "TransTime", "ShortCode", "TransAmount", "BillRefNumber", "MSISDN", "FirstName", processed, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Notification" (id, "tenantId", "userId", message, type, read, "createdAt") FROM stdin;
836ea152-69de-4e8e-a770-ac68b4698639	1	1	New task assigned: Trash Bag Issuance with 10 bags.	trash bags issurance task	f	2025-01-13 14:12:45.972
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Payment" (id, "tenantId", amount, "modeOfPayment", "firstName", receipted, "transactionId", ref, "receiptId", "createdAt") FROM stdin;
\.


--
-- Data for Name: Receipt; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Receipt" (id, "tenantId", "receiptNumber", amount, "modeOfPayment", "paidBy", "transactionCode", "phoneNumber", "paymentId", "customerId", "createdAt") FROM stdin;
\.


--
-- Data for Name: ReceiptInvoice; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ReceiptInvoice" (id, "receiptId", "invoiceId") FROM stdin;
\.


--
-- Data for Name: SMS; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SMS" (id, clientsmsid, mobile, message, status, "createdAt") FROM stdin;
\.


--
-- Data for Name: SMSConfig; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SMSConfig" (id, "tenantId", "partnerId", "apiKey", "shortCode", "customerSupportPhoneNumber", "createdAt", "updatedAt") FROM stdin;
1	1	11914	43e4e97130d5a2d886667c2d40ce48df	TAQAMALI	0702550190	2025-01-13 14:10:25.46	2025-01-13 14:10:25.46
\.


--
-- Data for Name: Task; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Task" (id, "tenantId", "createdBy", type, status, "declaredBags", "assignedAt", "startedAt", "completedAt", "createdAt", "updatedAt") FROM stdin;
1	1	1	BAG_ISSUANCE	PENDING	10	\N	\N	\N	2025-01-13 14:12:45.96	2025-01-13 14:12:45.96
\.


--
-- Data for Name: TaskAssignee; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."TaskAssignee" (id, "taskId", "assigneeId", "assignedAt") FROM stdin;
1	1	2	2025-01-13 14:12:45.963
\.


--
-- Data for Name: Tenant; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Tenant" (id, name, "createdBy", status, "subscriptionPlan", "monthlyCharge", "numberOfBags", "createdAt", "updatedAt") FROM stdin;
1	sikika softwares ltd	0722230603	ACTIVE	Simba	5000	5	2025-01-13 13:53:30.107	2025-01-13 14:32:15.37
\.


--
-- Data for Name: TrashBagIssuance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."TrashBagIssuance" (id, "taskId", "customerId", "tenantId", "issuedDate", "bagsIssued", "createdAt", "updatedAt") FROM stdin;
a18dadaa-0da9-4d7b-8c78-3ecb3efff038	1	c7c8261d-a0ff-4696-93d2-ee617c90cb05	1	2025-01-13 14:12:45.965	10	2025-01-13 14:12:45.966	2025-01-13 14:12:45.966
8faa1ef4-fe36-4281-88ef-cbf2831e79d0	1	8e33e527-f112-4692-a97e-5b9694912d26	1	2025-01-13 14:12:45.965	10	2025-01-13 14:12:45.966	2025-01-13 14:12:45.966
ef5e40c0-5d4d-49ff-a433-a2fd411961d4	1	e2ea0f31-3cc0-4ab8-aeab-3b7b4d0dd142	1	2025-01-13 14:12:45.965	10	2025-01-13 14:12:45.966	2025-01-13 14:12:45.966
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, "tenantId", "firstName", "lastName", email, "phoneNumber", gender, county, town, password, role, "customPermissions", "createdBy", status, "mfaEnabled", "bagsHeld", "originalBagsIssued", "createdAt", "updatedAt") FROM stdin;
1	1	kevin	kiumbe	kevoqmbe1@gmail.com	0722230603	Male	Nairobi	Westlands	$2b$10$dx17XjlPYVQZRkYOZTSdQOHoQJZ3Fsr8iKXtQfRJwmJVbf6QUARte	{ADMIN}	\N	\N	ACTIVE	f	\N	\N	2025-01-13 13:53:30.111	2025-01-13 13:53:30.111
2	1	nia	njeri	mary12@example.com	0702550190	Male	Nairobi	Westlands	$2b$10$SYgoGQpPANQXXV64yzmxM.UGHMxh9uin1XdtyNB9Q31b28CjYu48C	{collector}	\N	1	ACTIVE	f	\N	\N	2025-01-13 13:53:42.306	2025-01-13 13:57:44.384
\.


--
-- Data for Name: UserActivity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UserActivity" (id, "userId", action, "timestamp") FROM stdin;
\.


--
-- Data for Name: _CreatedUsers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."_CreatedUsers" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
\.


--
-- Name: MPESAConfig_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."MPESAConfig_id_seq"', 1, false);


--
-- Name: SMSConfig_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."SMSConfig_id_seq"', 1, true);


--
-- Name: TaskAssignee_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."TaskAssignee_id_seq"', 1, true);


--
-- Name: Task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Task_id_seq"', 1, true);


--
-- Name: Tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Tenant_id_seq"', 1, true);


--
-- Name: UserActivity_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."UserActivity_id_seq"', 1, false);


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."User_id_seq"', 2, true);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceItem InvoiceItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InvoiceItem"
    ADD CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY (id);


--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);


--
-- Name: MPESAConfig MPESAConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESAConfig"
    ADD CONSTRAINT "MPESAConfig_pkey" PRIMARY KEY (id);


--
-- Name: MPESATransactions MPESATransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESATransactions"
    ADD CONSTRAINT "MPESATransactions_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: ReceiptInvoice ReceiptInvoice_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReceiptInvoice"
    ADD CONSTRAINT "ReceiptInvoice_pkey" PRIMARY KEY (id);


--
-- Name: Receipt Receipt_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Receipt"
    ADD CONSTRAINT "Receipt_pkey" PRIMARY KEY (id);


--
-- Name: SMSConfig SMSConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SMSConfig"
    ADD CONSTRAINT "SMSConfig_pkey" PRIMARY KEY (id);


--
-- Name: SMS SMS_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SMS"
    ADD CONSTRAINT "SMS_pkey" PRIMARY KEY (id);


--
-- Name: TaskAssignee TaskAssignee_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY (id);


--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: TrashBagIssuance TrashBagIssuance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrashBagIssuance"
    ADD CONSTRAINT "TrashBagIssuance_pkey" PRIMARY KEY (id);


--
-- Name: UserActivity UserActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserActivity"
    ADD CONSTRAINT "UserActivity_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Customer_phoneNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON public."Customer" USING btree ("phoneNumber");


--
-- Name: Invoice_invoiceNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON public."Invoice" USING btree ("invoiceNumber");


--
-- Name: MPESAConfig_shortCode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MPESAConfig_shortCode_key" ON public."MPESAConfig" USING btree ("shortCode");


--
-- Name: MPESAConfig_tenantId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MPESAConfig_tenantId_key" ON public."MPESAConfig" USING btree ("tenantId");


--
-- Name: MPESATransactions_TransID_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MPESATransactions_TransID_key" ON public."MPESATransactions" USING btree ("TransID");


--
-- Name: Payment_transactionId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Payment_transactionId_key" ON public."Payment" USING btree ("transactionId");


--
-- Name: Receipt_paymentId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Receipt_paymentId_key" ON public."Receipt" USING btree ("paymentId");


--
-- Name: Receipt_receiptNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON public."Receipt" USING btree ("receiptNumber");


--
-- Name: SMSConfig_tenantId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "SMSConfig_tenantId_key" ON public."SMSConfig" USING btree ("tenantId");


--
-- Name: SMS_clientsmsid_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "SMS_clientsmsid_key" ON public."SMS" USING btree (clientsmsid);


--
-- Name: TaskAssignee_taskId_assigneeId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "TaskAssignee_taskId_assigneeId_key" ON public."TaskAssignee" USING btree ("taskId", "assigneeId");


--
-- Name: Task_tenantId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Task_tenantId_idx" ON public."Task" USING btree ("tenantId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_phoneNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_phoneNumber_key" ON public."User" USING btree ("phoneNumber");


--
-- Name: _CreatedUsers_AB_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "_CreatedUsers_AB_unique" ON public."_CreatedUsers" USING btree ("A", "B");


--
-- Name: _CreatedUsers_B_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "_CreatedUsers_B_index" ON public."_CreatedUsers" USING btree ("B");


--
-- Name: AuditLog AuditLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Customer Customer_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InvoiceItem InvoiceItem_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InvoiceItem"
    ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invoice Invoice_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invoice Invoice_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MPESAConfig MPESAConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESAConfig"
    ADD CONSTRAINT "MPESAConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MPESATransactions MPESATransactions_ShortCode_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESATransactions"
    ADD CONSTRAINT "MPESATransactions_ShortCode_fkey" FOREIGN KEY ("ShortCode") REFERENCES public."MPESAConfig"("shortCode") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MPESATransactions MPESATransactions_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MPESATransactions"
    ADD CONSTRAINT "MPESATransactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Notification Notification_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Payment Payment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ReceiptInvoice ReceiptInvoice_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReceiptInvoice"
    ADD CONSTRAINT "ReceiptInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ReceiptInvoice ReceiptInvoice_receiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReceiptInvoice"
    ADD CONSTRAINT "ReceiptInvoice_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES public."Receipt"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Receipt Receipt_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Receipt"
    ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Receipt Receipt_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Receipt"
    ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."Payment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Receipt Receipt_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Receipt"
    ADD CONSTRAINT "Receipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SMSConfig SMSConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SMSConfig"
    ADD CONSTRAINT "SMSConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskAssignee TaskAssignee_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskAssignee TaskAssignee_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Task Task_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Task Task_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TrashBagIssuance TrashBagIssuance_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrashBagIssuance"
    ADD CONSTRAINT "TrashBagIssuance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TrashBagIssuance TrashBagIssuance_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrashBagIssuance"
    ADD CONSTRAINT "TrashBagIssuance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TrashBagIssuance TrashBagIssuance_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TrashBagIssuance"
    ADD CONSTRAINT "TrashBagIssuance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserActivity UserActivity_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserActivity"
    ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _CreatedUsers _CreatedUsers_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."_CreatedUsers"
    ADD CONSTRAINT "_CreatedUsers_A_fkey" FOREIGN KEY ("A") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _CreatedUsers _CreatedUsers_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."_CreatedUsers"
    ADD CONSTRAINT "_CreatedUsers_B_fkey" FOREIGN KEY ("B") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

