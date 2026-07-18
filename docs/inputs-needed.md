# Inputs and decisions

## Needed before frontend implementation

1. Presentation duration and any submission constraints not present in the supplied brief.
2. Whether the demo needs authentication or can use one shared campaign.

Resolved: the local project is connected to the Lovable-created `Stefano-Prometekio/lilly-ai` repository.

## Needed before live voice integration

1. ElevenLabs account with API access and the selected American-English female voice.
2. Twilio account and an outbound-capable number imported into ElevenLabs, or another supported SIP setup.
3. Consenting role-player destination number(s).
4. Decision on the spoken AI/recording disclosure.

Store credentials locally; do not paste secrets into chat or commit them.

## Needed before data integration

1. Supabase project/region decision, unless Lovable Cloud is chosen.
2. OpenAI API access for document extraction and backend planning.
3. Google Places API access, or approval to use OpenStreetMap as the initial lower-coverage source.
4. One representative catering quote PDF for the document intake demo.

## Needed to freeze the demo scenario

1. Event city/venue, date, guest count, service style, budget, and must-have dietary constraint. These are editable at runtime and do not need to be frozen in code.
2. The main presenter will role-play each vendor sequentially in the browser-first demo.
3. Private concession limits for the lowballer, upseller, and stonewaller.
4. The single outcome we want the final callback to improve: price, delivery, tableware, deposit, or cancellation.

## Needed before GitHub publication

1. Repository owner/organization and final repository name.
2. Public or private visibility.
3. Whether Lovable or this local repository should be the source that creates the GitHub repository.
