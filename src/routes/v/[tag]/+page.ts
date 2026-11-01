import { error } from "@sveltejs/kit";
import { getVersion, versions } from "$lib/archive";
import type { EntryGenerator, PageLoad } from "./$types";

export const entries: EntryGenerator = () => versions.map((v) => ({ tag: v.tag }));

export const load: PageLoad = ({ params }) => {
    const version = getVersion(params.tag);
    if (!version) {
        error(404, `No archived version ${params.tag}`);
    }

    const index = versions.indexOf(version);
    return {
        version,
        // list is sorted newest-first, so "newer" is the previous index
        newer: index > 0 ? versions[index - 1] : null,
        older: index < versions.length - 1 ? versions[index + 1] : null,
    };
};
