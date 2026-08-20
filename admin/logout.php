<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';

logoutAdmin();
header('Location: login.php');
exit;
