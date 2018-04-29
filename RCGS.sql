/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*
*        Copyright 2018 Marco De Nicolo
*/

CREATE TABLE users (
    id integer NOT NULL,
    mail text NOT NULL,
    name text NOT NULL,
    password text NOT NULL,
    user_level boolean DEFAULT false NOT NULL,
    CONSTRAINT users_mail_check CHECK ((mail ~~ '_%@_%._%'::text)),
    CONSTRAINT users_name_check CHECK ((name !~~ '%@%'::text))
);
