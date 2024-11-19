<?php
$folders = array_filter(glob('*', GLOB_ONLYDIR), 'is_dir');
echo json_encode($folders);
?>
